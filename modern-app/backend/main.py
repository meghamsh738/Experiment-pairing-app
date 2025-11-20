"""
Experiment Pairing App Backend API
Extracted from the original Tkinter application.
Handles animal distribution and pairing logic.
"""

import io
from pathlib import Path
from typing import List, Dict, Optional, Tuple

import pandas as pd
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


app = FastAPI(title="Experiment Pairing API")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== MODELS ====================

class AnimalInput(BaseModel):
    animal_id: str
    genotype: str
    sex: str
    age: int


class DistributeRequest(BaseModel):
    animals: List[AnimalInput]
    num_groups: int
    age_leeway: int
    genotype_filter: Optional[str] = None
    selected_genotypes: Optional[List[str]] = None
    group_names: Optional[List[str]] = None
    use_example: bool = False


class PairRequest(BaseModel):
    animals: List[AnimalInput]
    age_leeway: int
    genotype_filter: Optional[str] = None
    selected_genotypes: Optional[List[str]] = None
    use_example: bool = False


# ==================== CORE LOGIC ====================
ROOT_DIR = Path(__file__).resolve().parent.parent
EXAMPLE_ANIMALS_PATH = ROOT_DIR / "example_data" / "animals.csv"


def load_example_animals() -> pd.DataFrame:
    """Load bundled example animals CSV into a DataFrame."""
    if not EXAMPLE_ANIMALS_PATH.exists():
        raise FileNotFoundError(f"Missing example dataset at {EXAMPLE_ANIMALS_PATH}")
    df = pd.read_csv(EXAMPLE_ANIMALS_PATH)
    # Normalize column names to expected schema
    df.columns = [c.lower() for c in df.columns]
    df = df.rename(columns={
        "animal_id": "animal_id",
        "genotype": "genotype",
        "sex": "sex",
        "age": "age"
    })
    return df


def build_animals_df(request) -> pd.DataFrame:
    """Return a DataFrame from request animals or the bundled example data."""
    if getattr(request, "use_example", False) or not getattr(request, "animals", []):
        return load_example_animals()
    animals_data = [a.dict() for a in request.animals]
    return pd.DataFrame(animals_data)


def filter_by_genotype(df: pd.DataFrame, request) -> pd.DataFrame:
    """Apply genotype filtering from either a single filter or selected list."""
    if getattr(request, "selected_genotypes", None):
        df = df[df['genotype'].isin(request.selected_genotypes)]
    elif getattr(request, "genotype_filter", None):
        df = df[df['genotype'] == request.genotype_filter]
    return df


def summarize(df: pd.DataFrame, groups: List[pd.DataFrame]) -> str:
    """Generate a lightweight summary string for the UI."""
    total = len(df)
    genotype_counts = df.groupby('genotype').size().to_dict()
    sex_counts = df.groupby('sex').size().to_dict()
    group_sizes = {i + 1: len(g) for i, g in enumerate(groups)}
    lines = [
        f"Total animals: {total}",
        f"Genotypes: {genotype_counts}",
        f"Sex: {sex_counts}",
        f"Group sizes: {group_sizes}"
    ]
    return " | ".join(lines)

def distribute_animals(animals_df: pd.DataFrame, num_groups: int, age_leeway: int) -> List[pd.DataFrame]:
    """
    Distribute animals into groups, balancing by genotype, sex, and age.
    """
    groups = [pd.DataFrame() for _ in range(num_groups)]
    
    # Group by genotype and sex
    for (genotype, sex), subgroup in animals_df.groupby(['genotype', 'sex']):
        # Sort by age
        subgroup = subgroup.sort_values('age')
        
        # Distribute evenly across groups
        for i, (idx, animal) in enumerate(subgroup.iterrows()):
            group_idx = i % num_groups
            groups[group_idx] = pd.concat([groups[group_idx], animal.to_frame().T], ignore_index=True)
    
    return groups


def pair_animals(animals_df: pd.DataFrame, age_leeway: int) -> List[Tuple[pd.Series, pd.Series]]:
    """
    Pair animals based on sex, genotype, and age proximity.
    Returns list of (male, female) tuples.
    """
    pairs = []
    
    # Separate males and females
    males = animals_df[animals_df['sex'].str.upper() == 'M'].copy()
    females = animals_df[animals_df['sex'].str.upper() == 'F'].copy()
    
    # Sort by age
    males = males.sort_values('age')
    females = females.sort_values('age')
    
    used_females = set()
    
    for _, male in males.iterrows():
        best_match = None
        best_age_diff = float('inf')
        
        for idx, female in females.iterrows():
            if idx in used_females:
                continue
            
            # Check genotype match
            if male['genotype'] != female['genotype']:
                continue
            
            # Check age compatibility
            age_diff = abs(male['age'] - female['age'])
            if age_diff <= age_leeway and age_diff < best_age_diff:
                best_match = (idx, female)
                best_age_diff = age_diff
        
        if best_match:
            used_females.add(best_match[0])
            pairs.append((male, best_match[1]))
    
    return pairs


# ==================== API ENDPOINTS ====================

@app.post("/distribute")
async def distribute_endpoint(request: DistributeRequest):
    """
    Distribute animals into groups.
    """
    try:
        df = build_animals_df(request)
        df = filter_by_genotype(df, request)
        
        if df.empty:
            raise HTTPException(status_code=400, detail="No animals match the criteria")
        
        # Distribute
        groups = distribute_animals(df, request.num_groups, request.age_leeway)
        
        # Convert groups to dict format
        result_groups = []
        for i, group in enumerate(groups):
            if not group.empty:
                result_groups.append({
                    "group_number": i + 1,
                    "group_name": (request.group_names[i] if request.group_names and i < len(request.group_names) else f"Group {i+1}"),
                    "animals": group.to_dict('records'),
                    "count": len(group)
                })
        
        return {
            "success": True,
            "groups": result_groups,
            "total_animals": len(df),
            "summary": summarize(df, groups)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/pair")
async def pair_endpoint(request: PairRequest):
    """
    Pair animals by sex, genotype, and age.
    """
    try:
        df = build_animals_df(request)
        
        df = filter_by_genotype(df, request)
        
        if df.empty:
            raise HTTPException(status_code=400, detail="No animals match the criteria")
        
        # Pair animals
        pairs = pair_animals(df, request.age_leeway)
        
        # Convert pairs to dict format
        result_pairs = []
        for male, female in pairs:
            result_pairs.append({
                "male": male.to_dict(),
                "female": female.to_dict(),
                "age_difference": abs(male['age'] - female['age'])
            })
        
        # Find unpaired animals
        paired_ids = set()
        for male, female in pairs:
            paired_ids.add(male['animal_id'])
            paired_ids.add(female['animal_id'])
        
        unpaired = df[~df['animal_id'].isin(paired_ids)]
        
        return {
            "success": True,
            "pairs": result_pairs,
            "unpaired": unpaired.to_dict('records'),
            "total_pairs": len(result_pairs),
            "total_unpaired": len(unpaired),
            "summary": summarize(df, [pd.DataFrame([p[0] for p in pairs]), pd.DataFrame([p[1] for p in pairs])])
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/export-distribute")
async def export_distribute(request: DistributeRequest):
    """
    Export distribution results to Excel.
    """
    try:
        df = build_animals_df(request)
        df = filter_by_genotype(df, request)
        
        groups = distribute_animals(df, request.num_groups, request.age_leeway)
        
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            for i, group in enumerate(groups):
                if not group.empty:
                    group.to_excel(writer, sheet_name=f"Group_{i+1}", index=False)
        
        output.seek(0)
        
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=animal_distribution.xlsx"}
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/export-pairs")
async def export_pairs(request: PairRequest):
    """
    Export pairing results to Excel.
    """
    try:
        df = build_animals_df(request)
        df = filter_by_genotype(df, request)
        
        pairs = pair_animals(df, request.age_leeway)
        
        # Create pairs DataFrame
        pairs_data = []
        for male, female in pairs:
            pairs_data.append({
                'Male_ID': male['animal_id'],
                'Male_Genotype': male['genotype'],
                'Male_Age': male['age'],
                'Female_ID': female['animal_id'],
                'Female_Genotype': female['genotype'],
                'Female_Age': female['age'],
                'Age_Difference': abs(male['age'] - female['age'])
            })
        
        pairs_df = pd.DataFrame(pairs_data)
        
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            if not pairs_df.empty:
                pairs_df.to_excel(writer, sheet_name="Pairs", index=False)
        
        output.seek(0)
        
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=animal_pairs.xlsx"}
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


@app.post("/upload")
async def upload_endpoint(file: UploadFile = File(...)):
    """
    Upload Excel/CSV and return parsed animals plus genotype list.
    """
    try:
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Empty file")
        buffer = io.BytesIO(content)
        if file.filename.lower().endswith((".xlsx", ".xls")):
            df = pd.read_excel(buffer)
        else:
            df = pd.read_csv(buffer)

        df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
        col_map = {
            "animal_id": "animal_id",
            "genotype": "genotype",
            "sex": "sex",
            "age": "age"
        }
        missing = [k for k in ["animal_id", "genotype", "sex", "age"] if k not in df.columns]
        if missing:
            raise HTTPException(status_code=400, detail=f"Missing required columns: {missing}")
        df = df.rename(columns=col_map)
        animals = df.to_dict('records')
        genotypes = sorted(df['genotype'].dropna().unique().tolist())
        return {"animals": animals, "genotypes": genotypes}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)
