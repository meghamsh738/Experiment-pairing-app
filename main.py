import pandas as pd
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
import os
import logging
from datetime import datetime
import traceback
from pathlib import Path

class AnimalPairingApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Animal Pairing and Grouping Tool™ by Meghamsh Teja Konda")
        self.root.geometry("1000x700")

        # Initialize attributes
        self.file_path = ""
        self.df = None
        self.selected_genotypes = []
        self.groups = {}
        self.unpaired_df = None
        self.summary = {}
        self.paired_df = None  # Tracks Pairing mode
        self.logger = None  # Will be initialized in setup_logging

        self.leeway_var = tk.IntVar(value=3)  # Initialize leeway variable with default value 3

        self.setup_logging()  # Initialize logging
        self.create_widgets()

    def setup_logging(self):
        """Sets up the logging configuration."""
        try:
            log_dir = Path.home() / ".local" / "state" / "experiment-pairing"
            log_dir.mkdir(parents=True, exist_ok=True)
            log_filename = log_dir / f"animal_pairing_app_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"

            logging.basicConfig(
                level=logging.DEBUG,
                format='%(asctime)s - %(levelname)s - %(message)s',
                handlers=[
                    logging.FileHandler(log_filename),
                    logging.StreamHandler()
                ]
            )
            self.logger = logging.getLogger()
            self.logger.info("Application started.")
        except Exception as e:
            messagebox.showerror("Logging Setup Error", f"Failed to set up logging.\n{e}")
            raise  # Re-raise the exception after notifying the user

    def create_widgets(self):
        """Creates the main widgets and tabs in the application."""
        # Create Notebook for tabs
        self.notebook = ttk.Notebook(self.root)
        self.notebook.pack(expand=True, fill='both')

        # Create frames for each tab
        self.tab_upload = ttk.Frame(self.notebook)
        self.tab_results = ttk.Frame(self.notebook)

        self.notebook.add(self.tab_upload, text='Upload & Configure')
        self.notebook.add(self.tab_results, text='Results & Summary')

        # ----- Tab 1: Upload & Configure -----
        self.create_upload_tab()

        # ----- Tab 2: Results & Summary -----
        self.create_results_tab()

        # Create a Menu Bar
        menubar = tk.Menu(self.root)
        self.root.config(menu=menubar)

        # Add 'Help' Menu
        help_menu = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="Help", menu=help_menu)
        help_menu.add_command(label="About", command=self.show_about_dialog)

    def show_about_dialog(self):
        """Displays the About dialog with trademark and developer information."""
        about_text = (
            "Animal Pairing and Grouping Tool™\n"
            "Version 1.0\n\n"
            "Developed by Meghamsh Teja Konda\n"
            "© 2024 Meghamsh Teja Konda. All rights reserved."
        )
        messagebox.showinfo("About", about_text)

    def create_upload_tab(self):
        """Creates the upload and configuration tab."""
        # Frame for File Upload
        upload_frame = ttk.LabelFrame(self.tab_upload, text="Step 1: Upload Data Sheet")
        upload_frame.pack(fill="x", padx=10, pady=10)

        upload_btn = ttk.Button(upload_frame, text="Upload Excel/CSV File", command=self.upload_file)
        upload_btn.pack(padx=10, pady=10)

        # Frame for Genotype Selection
        genotype_frame = ttk.LabelFrame(self.tab_upload, text="Step 2: Select Genotypes for Pairing")
        genotype_frame.pack(fill="both", expand=True, padx=10, pady=10)

        self.genotype_vars = {}
        self.genotype_checks = {}
        self.genotype_canvas = tk.Canvas(genotype_frame)
        self.genotype_scroll = ttk.Scrollbar(genotype_frame, orient="vertical", command=self.genotype_canvas.yview)
        self.genotype_inner = ttk.Frame(self.genotype_canvas)

        self.genotype_inner.bind(
            "<Configure>",
            lambda e: self.genotype_canvas.configure(
                scrollregion=self.genotype_canvas.bbox("all")
            )
        )

        self.genotype_canvas.create_window((0, 0), window=self.genotype_inner, anchor="nw")
        self.genotype_canvas.configure(yscrollcommand=self.genotype_scroll.set)

        self.genotype_canvas.pack(side="left", fill="both", expand=True)
        self.genotype_scroll.pack(side="right", fill="y")

        # Frame for Group Configuration
        group_frame = ttk.LabelFrame(self.tab_upload, text="Step 3: Configure Groups")
        group_frame.pack(fill="x", padx=10, pady=10)

        ttk.Label(group_frame, text="Number of Groups:").grid(row=0, column=0, padx=5, pady=5, sticky="e")
        self.num_groups_var = tk.IntVar(value=2)
        self.num_groups_spin = ttk.Spinbox(group_frame, from_=1, to=20, textvariable=self.num_groups_var, width=5)
        self.num_groups_spin.grid(row=0, column=1, padx=5, pady=5, sticky="w")
        self.num_groups_spin.bind("<FocusOut>", self.update_group_entries)

        self.group_names_frame = ttk.Frame(group_frame)
        self.group_names_frame.grid(row=1, column=0, columnspan=2, padx=5, pady=5, sticky="w")

        # Initialize group entries list
        self.group_entries = []
        self.update_group_entries()

        # ----- Add Age Leeway Input Field -----
        ttk.Label(group_frame, text="Age Leeway (weeks):").grid(row=2, column=0, padx=5, pady=5, sticky="e")
        leeway_spin = ttk.Spinbox(group_frame, from_=0, to=52, textvariable=self.leeway_var, width=5)
        leeway_spin.grid(row=2, column=1, padx=5, pady=5, sticky="w")
        # Optional: Add a tooltip or default text if desired

        # Frame for Processing
        process_frame = ttk.Frame(self.tab_upload)
        process_frame.pack(fill="x", padx=10, pady=10)

        process_btn = ttk.Button(process_frame, text="Process Pairing", command=self.process_pairing)
        process_btn.pack(padx=10, pady=10)

    def create_results_tab(self):
        """Creates the results and summary tab."""
        # Frame for Summary
        summary_frame = ttk.LabelFrame(self.tab_results, text="Pairing and Grouping Summary")
        summary_frame.pack(fill="both", expand=True, padx=10, pady=10)

        self.summary_text = tk.Text(summary_frame, wrap="none")
        self.summary_text.pack(fill="both", expand=True)

        # Add Scrollbars to the summary text
        x_scroll = ttk.Scrollbar(summary_frame, orient="horizontal", command=self.summary_text.xview)
        x_scroll.pack(side="bottom", fill="x")
        y_scroll = ttk.Scrollbar(summary_frame, orient="vertical", command=self.summary_text.yview)
        y_scroll.pack(side="right", fill="y")
        self.summary_text.configure(xscrollcommand=x_scroll.set, yscrollcommand=y_scroll.set)

        # Frame for Export Button
        export_frame = ttk.Frame(self.tab_results)
        export_frame.pack(fill="x", padx=10, pady=10)

        export_btn = ttk.Button(export_frame, text="Export Results", command=self.export_results)
        export_btn.pack(padx=10, pady=10)

    def upload_file(self):
        """Handles the file upload process."""
        # Reset previous data
        self.reset_attributes()

        filetypes = [("Excel files", "*.xlsx *.xls"), ("CSV files", "*.csv"), ("All files", "*.*")]
        filepath = filedialog.askopenfilename(title="Open File", initialdir="/", filetypes=filetypes)
        if filepath:
            try:
                if filepath.endswith(('.xlsx', '.xls')):
                    self.df = pd.read_excel(filepath)
                elif filepath.endswith('.csv'):
                    self.df = pd.read_csv(filepath)
                else:
                    messagebox.showerror("Invalid File", "Please select a valid Excel or CSV file.")
                    self.logger.warning(f"User attempted to upload invalid file type: {filepath}")
                    return
                self.file_path = filepath
                messagebox.showinfo("Success", f"File '{os.path.basename(filepath)}' loaded successfully.")
                self.logger.info(f"File '{filepath}' loaded successfully.")
                self.populate_genotypes()
            except FileNotFoundError:
                messagebox.showerror("File Not Found", "The selected file was not found.")
                self.logger.error(f"File not found: {filepath}")
            except pd.errors.EmptyDataError:
                messagebox.showerror("Empty File", "The selected file is empty.")
                self.logger.error(f"Empty file: {filepath}")
            except pd.errors.ParserError:
                messagebox.showerror("Parsing Error", "Error parsing the file. Please check the file format.")
                self.logger.error(f"Parsing error in file: {filepath}")
            except Exception as e:
                messagebox.showerror("Unexpected Error", f"An unexpected error occurred.\n{e}")
                self.logger.error(f"Unexpected error reading file '{filepath}': {e}")
                self.logger.debug(traceback.format_exc())

    def populate_genotypes(self):
        """Populates the genotype selection checkboxes based on the uploaded data."""
        if self.df is not None:
            try:
                if 'Genotype' not in self.df.columns:
                    messagebox.showerror("Missing Column", "The uploaded file does not contain a 'Genotype' column.")
                    self.logger.error("Uploaded file missing 'Genotype' column.")
                    return
                genotypes = self.df['Genotype'].dropna().unique()
                self.logger.info(f"Detected genotypes: {genotypes}")
                # Clear previous genotype selections
                for widget in self.genotype_inner.winfo_children():
                    widget.destroy()
                self.genotype_vars = {}
                self.genotype_checks = {}
                for genotype in genotypes:
                    var = tk.BooleanVar()
                    chk = ttk.Checkbutton(self.genotype_inner, text=genotype, variable=var)
                    chk.pack(anchor="w")
                    self.genotype_vars[genotype] = var
                    self.genotype_checks[genotype] = chk
            except KeyError as e:
                messagebox.showerror("Missing Column", f"Missing column in DataFrame: {e}")
                self.logger.error(f"Missing column in DataFrame: {e}")
            except Exception as e:
                messagebox.showerror("Error", f"Failed to populate genotypes.\n{e}")
                self.logger.error(f"Error populating genotypes: {e}")
                self.logger.debug(traceback.format_exc())

    def update_group_entries(self, event=None):
        """Updates the group name entry fields based on the number of groups."""
        try:
            for entry in self.group_entries:
                entry.destroy()
            self.group_entries = []
            num = self.num_groups_var.get()
            self.logger.info(f"Number of groups set to: {num}")
            for i in range(num):
                ttk.Label(self.group_names_frame, text=f"Group {i + 1} Name:").grid(row=i, column=0, padx=5, pady=2, sticky="e")
                entry = ttk.Entry(self.group_names_frame)
                entry.grid(row=i, column=1, padx=5, pady=2, sticky="w")
                entry.insert(0, f"Group {i + 1}")  # Default group name
                self.group_entries.append(entry)
        except Exception as e:
            messagebox.showerror("Error", f"Failed to update group entries.\n{e}")
            self.logger.error(f"Error updating group entries: {e}")
            self.logger.debug(traceback.format_exc())

    def reset_attributes(self):
        """Resets attributes related to pairing and distribution."""
        self.paired_df = None
        self.groups = {}
        self.unpaired_df = None
        self.summary = {}
        self.selected_genotypes = []

    def process_pairing(self):
        """Processes the pairing and grouping of animals based on user configuration."""
        if self.df is None:
            messagebox.showerror("No Data", "Please upload a data sheet first.")
            self.logger.warning("Process attempted without uploading data.")
            return

        # Get selected genotypes
        selected_genotypes = [g for g, var in self.genotype_vars.items() if var.get()]
        if len(selected_genotypes) == 0:
            messagebox.showerror("Genotype Selection Error", "Please select at least one genotype.")
            self.logger.warning("Process attempted with no genotypes selected.")
            return
        self.selected_genotypes = selected_genotypes
        self.logger.info(f"Selected genotypes for pairing: {self.selected_genotypes}")

        # Get group information
        num_groups = self.num_groups_var.get()
        group_names = [entry.get().strip() for entry in self.group_entries]
        if len(group_names) != num_groups or any(not name for name in group_names):
            messagebox.showerror("Invalid Groups", "Please enter valid names for all groups.")
            self.logger.warning("Process attempted with invalid group names.")
            return
        self.logger.info(f"Configured groups: {group_names}")

        # Retrieve leeway value
        leeway = self.leeway_var.get()
        if leeway < 0:
            messagebox.showerror("Invalid Leeway", "Age leeway cannot be negative.")
            self.logger.warning("Process attempted with negative leeway value.")
            return
        self.logger.info(f"Age leeway set to: {leeway} weeks")

        try:
            if len(selected_genotypes) == 1:
                # Distribution mode
                self.paired_df = None  # Reset paired_df for distribution mode
                distributed_groups, ungrouped, summary = self.distribute_animals(selected_genotypes[0])
                if distributed_groups is None:
                    self.logger.error("Distribution failed due to previous errors.")
                    return

                # Store results
                self.groups = distributed_groups
                self.unpaired_df = ungrouped  # For consistency, though there should be none
                self.summary = summary

                # Switch to Results tab
                self.notebook.select(self.tab_results)

                # Display summary
                self.display_summary(None, ungrouped, distributed_groups, summary)

                messagebox.showinfo("Success", f"Distribution completed.\nCheck the 'Results & Summary' tab.")

            else:
                # Pairing mode
                paired, unpaired, summary = self.pair_animals(selected_genotypes, leeway)
                if paired is None and unpaired is None and summary is None:
                    self.logger.error("Pairing failed due to previous errors.")
                    return

                # Split paired into groups
                groups = self.split_into_groups(paired, group_names)
                self.logger.info("Successfully paired animals and split into groups.")

                # Store results for display and export
                self.paired_df = paired
                self.unpaired_df = unpaired
                self.groups = groups
                self.summary = summary

                # Switch to Results tab
                self.notebook.select(self.tab_results)

                # Display summary
                self.display_summary(paired, unpaired, groups, summary)

                messagebox.showinfo("Success", f"Pairing and grouping completed.\nCheck the 'Results & Summary' tab.")

        except ValueError as e:
            messagebox.showerror("Processing Error", f"Value error during processing.\n{e}")
            self.logger.error(f"Value error during processing: {e}")
        except Exception as e:
            messagebox.showerror("Error", f"An unexpected error occurred during processing.\n{e}")
            self.logger.error(f"Unexpected error during processing: {e}")
            self.logger.debug(traceback.format_exc())
            # Reset state to avoid inconsistent UI after failure
            self.reset_attributes()

    def distribute_animals(self, genotype):
        """Distributes animals of the selected genotype equally among the groups."""
        try:
            df = self.df.copy()

            # Validate required columns
            required_columns = ['Animal ID No.', 'Sex', 'Genotype', 'DOB', 'Today', 'Age (w)']
            missing_columns = [col for col in required_columns if col not in df.columns]
            if missing_columns:
                messagebox.showerror("Missing Columns",
                                     f"The uploaded file is missing the following columns: {', '.join(missing_columns)}.")
                self.logger.error(f"Uploaded file missing columns: {missing_columns}")
                return None, None, None

            # Remove duplicates based on 'Animal ID No.'
            initial_count = len(df)
            df = df.drop_duplicates(subset=["Animal ID No."], keep='first')
            self.logger.info(f"Removed duplicates. Records reduced from {initial_count} to {len(df)}.")

            # Filter by selected genotype
            df = df[df['Genotype'] == genotype]
            self.logger.info(f"Filtered data by selected genotype '{genotype}'. Remaining records: {len(df)}.")

            # Convert DOB and Today to datetime
            df['DOB'] = pd.to_datetime(df['DOB'], dayfirst=True, errors='coerce')
            df['Today'] = pd.to_datetime(df['Today'], dayfirst=True, errors='coerce')

            # Check for any NaT in dates
            if df['DOB'].isnull().any() or df['Today'].isnull().any():
                messagebox.showerror("Invalid Dates",
                                     "Some 'DOB' or 'Today' entries could not be parsed. Please check your data.")
                self.logger.error("Invalid date entries found in 'DOB' or 'Today' columns.")
                return None, None, None

            # Calculate Age in weeks (Age (w)) if not present or NaN
            if 'Age (w)' not in df.columns or df['Age (w)'].isnull().any():
                df['Age (w)'] = ((df['Today'] - df['DOB']).dt.days // 7)
                self.logger.info("Calculated 'Age (w)' from 'DOB' and 'Today'.")
            else:
                # Ensure 'Age (w)' is numeric
                df['Age (w)'] = pd.to_numeric(df['Age (w)'], errors='coerce')
                if df['Age (w)'].isnull().any():
                    messagebox.showerror("Invalid Age", "'Age (w)' column contains non-numeric values.")
                    self.logger.error("Non-numeric values found in 'Age (w)' column.")
                    return None, None, None

            # Sort animals by Sex and Age for consistent distribution
            df = df.sort_values(by=['Sex', 'Age (w)'])

            # Initialize groups
            group_names = [entry.get().strip() for entry in self.group_entries]
            num_groups = len(group_names)
            groups = {name: [] for name in group_names}

            # Distribute animals equally among the groups
            for idx, (_, animal) in enumerate(df.iterrows()):
                group_name = group_names[idx % num_groups]
                groups[group_name].append(animal)

            # No ungrouped animals in this case
            ungrouped = pd.DataFrame()

            # Summary
            total_animals = len(df)
            summary = {
                'Total Animals': total_animals
            }

            self.logger.info("Animals distributed among groups successfully.")
            return groups, ungrouped, summary

        except Exception as e:
            messagebox.showerror("Error", f"An unexpected error occurred during distribution.\n{e}")
            self.logger.error(f"Unexpected error during distribution: {e}")
            self.logger.debug(traceback.format_exc())
            return None, None, None

    def pair_animals(self, selected_genotypes, leeway):
        """Pairs animals based on selected genotypes and returns paired and unpaired DataFrames along with a summary."""
        try:
            df = self.df.copy()

            # Validate required columns
            required_columns = ['Animal ID No.', 'Sex', 'Genotype', 'DOB', 'Today', 'Age (w)']
            missing_columns = [col for col in required_columns if col not in df.columns]
            if missing_columns:
                messagebox.showerror("Missing Columns",
                                     f"The uploaded file is missing the following columns: {', '.join(missing_columns)}.")
                self.logger.error(f"Uploaded file missing columns: {missing_columns}")
                return None, None, None

            # Remove duplicates based on 'Animal ID No.' and 'Sex'
            initial_count = len(df)
            df = df.drop_duplicates(subset=["Animal ID No.", "Sex"], keep='first')
            self.logger.info(f"Removed duplicates. Records reduced from {initial_count} to {len(df)}.")

            # Filter by selected genotypes
            df = df[df['Genotype'].isin(selected_genotypes)]
            self.logger.info(f"Filtered data by selected genotypes. Remaining records: {len(df)}.")

            # Convert DOB and Today to datetime
            df['DOB'] = pd.to_datetime(df['DOB'], dayfirst=True, errors='coerce')
            df['Today'] = pd.to_datetime(df['Today'], dayfirst=True, errors='coerce')

            # Check for any NaT in dates
            if df['DOB'].isnull().any() or df['Today'].isnull().any():
                messagebox.showerror("Invalid Dates",
                                     "Some 'DOB' or 'Today' entries could not be parsed. Please check your data.")
                self.logger.error("Invalid date entries found in 'DOB' or 'Today' columns.")
                return None, None, None

            # Calculate Age in weeks (Age (w)) if not present or NaN
            if 'Age (w)' not in df.columns or df['Age (w)'].isnull().any():
                df['Age (w)'] = ((df['Today'] - df['DOB']).dt.days // 7)
                self.logger.info("Calculated 'Age (w)' from 'DOB' and 'Today'.")
            else:
                # Ensure 'Age (w)' is numeric
                df['Age (w)'] = pd.to_numeric(df['Age (w)'], errors='coerce')
                if df['Age (w)'].isnull().any():
                    messagebox.showerror("Invalid Age", "'Age (w)' column contains non-numeric values.")
                    self.logger.error("Non-numeric values found in 'Age (w)' column.")
                    return None, None, None

            # Initialize paired and unpaired lists
            paired = []
            unpaired = df.copy()

            # Sort the DataFrame for consistent pairing
            df = df.sort_values(by=['Sex', 'Age (w)'])

            # Create a DataFrame to track whether an animal has been paired
            df['Paired'] = False

            # Pairing logic
            for idx, animal in df.iterrows():
                if animal['Paired']:
                    continue  # Skip if already paired

                # Find candidates to pair with
                # Candidates are animals that are not paired, have same sex, different Animal ID, age within leeway
                candidates = df[
                    (~df['Paired']) &
                    (df['Sex'] == animal['Sex']) &
                    (df['Animal ID No.'] != animal['Animal ID No.']) &
                    (abs(df['Age (w)'] - animal['Age (w)']) <= leeway)
                    ]

                # If multiple genotypes are selected, prefer animals with different genotype
                if len(selected_genotypes) > 1:
                    candidates_diff_genotype = candidates[candidates['Genotype'] != animal['Genotype']]
                    if not candidates_diff_genotype.empty:
                        candidates = candidates_diff_genotype

                if candidates.empty:
                    continue  # No candidate found

                # Select the candidate with the smallest age difference
                candidates = candidates.copy()  # Avoid SettingWithCopyWarning
                candidates.loc[:, 'Age_Diff'] = abs(candidates['Age (w)'] - animal['Age (w)'])
                best_match_idx = candidates['Age_Diff'].idxmin()
                best_match = candidates.loc[best_match_idx]

                # Add to paired list
                paired.append({
                    'Animal 1': animal,
                    'Animal 2': best_match
                })

                # Mark both animals as paired
                df.at[idx, 'Paired'] = True
                df.at[best_match_idx, 'Paired'] = True

                # Remove paired animals from unpaired list
                unpaired = unpaired[
                    (unpaired['Animal ID No.'] != animal['Animal ID No.']) &
                    (unpaired['Animal ID No.'] != best_match['Animal ID No.'])
                    ]

                self.logger.debug(
                    f"Paired Animal ID {animal['Animal ID No.']} with Animal ID {best_match['Animal ID No.']}."
                )

            # Convert paired list to DataFrame for easier handling
            paired_df = pd.DataFrame(paired)
            self.logger.info(f"Total pairs formed: {len(paired_df)}.")

            # Summary
            summary = {
                'Total Pairs': len(paired_df),
                'Total Unpaired': len(unpaired)
            }
            return paired_df, unpaired, summary

        except Exception as e:
            messagebox.showerror("Error", f"An error occurred during pairing.\n{e}")
            self.logger.error(f"Error during pairing: {e}")
            self.logger.debug(traceback.format_exc())
            return None, None, None

    def split_into_groups(self, paired_df, group_names):
        """Splits the paired animals into specified groups."""
        if not group_names:
            messagebox.showerror("Invalid Groups", "No group names provided.")
            self.logger.error("No group names provided for splitting.")
            return {}

        try:
            num_groups = len(group_names)
            if num_groups == 0:
                raise ValueError("Number of groups cannot be zero.")

            groups = {name: [] for name in group_names}
            for idx, row in paired_df.iterrows():
                group_name = group_names[idx % num_groups]
                groups[group_name].append(row)
            self.logger.info("Paired animals split into groups successfully.")
            return groups
        except ValueError as e:
            messagebox.showerror("Group Splitting Error", f"{e}")
            self.logger.error(f"Group splitting error: {e}")
            return {}
        except Exception as e:
            messagebox.showerror("Error", f"An error occurred during group splitting.\n{e}")
            self.logger.error(f"Error during group splitting: {e}")
            self.logger.debug(traceback.format_exc())
            return {}

    def export_results(self):
        """Exports the pairing and grouping results to Excel files."""
        if not hasattr(self, 'groups') or not hasattr(self, 'summary'):
            messagebox.showerror("No Data", "Please process pairing or distribution first.")
            self.logger.warning("Export attempted without processing.")
            return

        try:
            # Ask for export directory
            export_path = filedialog.askdirectory(title="Select Export Directory")
            if not export_path:
                self.logger.warning("User canceled export directory selection.")
                return

            if self.paired_df is not None:
                # Pairing mode
                # Export paired animals
                paired_excel_path = self.export_paired_animals(export_path)

                # Export unpaired animals
                unpaired_excel_path = self.export_unpaired_animals(export_path)

                # Export groups with counts
                groups_excel_path = self.export_groups_with_counts(export_path)

                # Export summary with counts
                summary_path = self.export_summary_with_counts(export_path)

                self.logger.info(f"Paired animals exported to '{paired_excel_path}'.")
                self.logger.info(f"Unpaired animals exported to '{unpaired_excel_path}'.")
                self.logger.info(f"Groups with counts exported to '{groups_excel_path}'.")
                self.logger.info(f"Summary with counts exported to '{summary_path}'.")
            else:
                # Distribution mode
                # Export groups
                groups_excel_path = self.export_distributed_groups(export_path)

                # Export summary
                summary_path = self.export_distribution_summary(export_path)

                self.logger.info(f"Groups exported to '{groups_excel_path}'.")
                self.logger.info(f"Summary exported to '{summary_path}'.")

            # Inform user
            messagebox.showinfo("Export Successful", f"Results exported successfully to '{export_path}'.")
        except FileNotFoundError:
            messagebox.showerror("Export Error", "The specified export directory was not found.")
            self.logger.error("Export directory not found.")
        except PermissionError:
            messagebox.showerror("Export Error", "Permission denied. Cannot write to the selected directory.")
            self.logger.error("Permission denied during export.")
        except (ValueError, IOError) as e:
            messagebox.showerror("Export Error", f"Failed to write Excel file.\n{e}")
            self.logger.error(f"Exporting Excel file error: {e}")
        except Exception as e:
            messagebox.showerror("Error", f"An unexpected error occurred during export.\n{e}")
            self.logger.error(f"Unexpected error during export: {e}")
            self.logger.debug(traceback.format_exc())

    def export_paired_animals(self, export_path):
        """Exports paired animals to a single Excel sheet with group names."""
        paired_export = []

        for group_name, pairs in self.groups.items():
            for idx, pair in enumerate(pairs, start=1):
                paired_export.append({
                    'Group Name': group_name,
                    'Pair No.': idx,
                    'Animal 1 ID': pair['Animal 1']['Animal ID No.'],
                    'Animal 1 Sex': pair['Animal 1']['Sex'],
                    'Animal 1 Genotype': pair['Animal 1']['Genotype'],
                    'Animal 1 Age (w)': pair['Animal 1']['Age (w)'],
                    'Animal 2 ID': pair['Animal 2']['Animal ID No.'],
                    'Animal 2 Sex': pair['Animal 2']['Sex'],
                    'Animal 2 Genotype': pair['Animal 2']['Genotype'],
                    'Animal 2 Age (w)': pair['Animal 2']['Age (w)']
                })

        paired_export_df = pd.DataFrame(paired_export)
        paired_excel_path = os.path.join(export_path, "Paired_Animals_with_Group.xlsx")

        # Write to Excel
        paired_export_df.to_excel(paired_excel_path, index=False, sheet_name='All_Groups')
        return paired_excel_path

    def export_unpaired_animals(self, export_path):
        """Exports unpaired animals to an Excel file."""
        if self.unpaired_df is not None and not self.unpaired_df.empty:
            unpaired_excel_path = os.path.join(export_path, "Unpaired_Animals.xlsx")
            self.unpaired_df.to_excel(unpaired_excel_path, index=False)
            return unpaired_excel_path
        else:
            self.logger.info("No unpaired animals to export.")
            return ""

    def export_groups_with_counts(self, export_path):
        """Exports groups with counts to a single Excel sheet, including gender breakdown in age distribution."""
        groups_excel_path = os.path.join(export_path, "Groups_with_Counts.xlsx")
        all_groups_data = []

        if self.paired_df is not None:
            # Pairing mode
            for group_name, pairs in self.groups.items():
                for idx, pair in enumerate(pairs, start=1):
                    all_groups_data.append({
                        'Group Name': group_name,
                        'Pair No.': idx,
                        'Animal 1 ID': pair['Animal 1']['Animal ID No.'],
                        'Animal 1 Sex': pair['Animal 1']['Sex'],
                        'Animal 1 Genotype': pair['Animal 1']['Genotype'],
                        'Animal 1 Age (w)': pair['Animal 1']['Age (w)'],
                        'Animal 2 ID': pair['Animal 2']['Animal ID No.'],
                        'Animal 2 Sex': pair['Animal 2']['Sex'],
                        'Animal 2 Genotype': pair['Animal 2']['Genotype'],
                        'Animal 2 Age (w)': pair['Animal 2']['Age (w)']
                    })
        else:
            # Distribution mode
            for group_name, animals in self.groups.items():
                for idx, animal in enumerate(animals, start=1):
                    all_groups_data.append({
                        'Group Name': group_name,
                        'Animal No.': idx,
                        'Animal ID': animal['Animal ID No.'],
                        'Sex': animal['Sex'],
                        'Genotype': animal['Genotype'],
                        'Age (w)': animal['Age (w)']
                    })

        # Create a single DataFrame for all groups
        all_groups_df = pd.DataFrame(all_groups_data)

        # Write to a single sheet
        all_groups_df.to_excel(groups_excel_path, index=False, sheet_name='All_Groups')
        return groups_excel_path

    def export_distributed_groups(self, export_path):
        """Exports distributed groups to a single Excel sheet."""
        groups_excel_path = os.path.join(export_path, "Distributed_Groups.xlsx")
        all_groups_data = []

        for group_name, animals in self.groups.items():
            for idx, animal in enumerate(animals, start=1):
                all_groups_data.append({
                    'Group Name': group_name,
                    'Animal No.': idx,
                    'Animal ID': animal['Animal ID No.'],
                    'Sex': animal['Sex'],
                    'Genotype': animal['Genotype'],
                    'Age (w)': animal['Age (w)']
                })

        # Create a single DataFrame for all groups
        all_groups_df = pd.DataFrame(all_groups_data)

        # Write to a single sheet
        all_groups_df.to_excel(groups_excel_path, index=False, sheet_name='All_Groups')
        return groups_excel_path

    def export_distribution_summary(self, export_path):
        """Exports the distribution summary to a single Excel sheet."""
        summary_excel_path = os.path.join(export_path, "Distribution_Summary.xlsx")
        try:
            with pd.ExcelWriter(summary_excel_path, engine='xlsxwriter') as writer:
                # Initialize the starting row
                startrow = 0

                # Overall summary
                summary_df = pd.DataFrame([self.summary])
                summary_df.to_excel(writer, sheet_name='Summary', index=False, startrow=startrow)
                startrow += len(summary_df) + 2  # Add space between tables

                # Group summaries
                group_summaries = []
                age_distribution_data = []

                for group_name, animals in self.groups.items():
                    male_count = sum(1 for animal in animals if animal['Sex'].strip().lower() == 'male')
                    female_count = sum(1 for animal in animals if animal['Sex'].strip().lower() == 'female')

                    # Age distribution
                    age_gender_counts = {}
                    for animal in animals:
                        sex = animal['Sex'].strip().lower()
                        age = animal['Age (w)']

                        if age not in age_gender_counts:
                            age_gender_counts[age] = {'Males': 0, 'Females': 0}
                        if sex == 'male':
                            age_gender_counts[age]['Males'] += 1
                        elif sex == 'female':
                            age_gender_counts[age]['Females'] += 1

                    group_summaries.append({
                        'Group Name': group_name,
                        'Number of Animals': male_count + female_count,
                        'Males': male_count,
                        'Females': female_count
                    })

                    # Prepare age distribution data
                    for age, counts in age_gender_counts.items():
                        age_distribution_data.append({
                            'Group Name': group_name,
                            'Age (w)': age,
                            'Males': counts['Males'],
                            'Females': counts['Females']
                        })

                group_summaries_df = pd.DataFrame(group_summaries)
                age_distribution_df = pd.DataFrame(age_distribution_data)

                # Write group summaries
                group_summaries_df.to_excel(writer, sheet_name='Summary', index=False, startrow=startrow)
                startrow += len(group_summaries_df) + 2  # Add space between tables

                # Write age distribution summaries
                age_distribution_df.to_excel(writer, sheet_name='Summary', index=False, startrow=startrow)

            return summary_excel_path
        except Exception as e:
            messagebox.showerror("Export Error", f"Failed to export summary.\n{e}")
            self.logger.error(f"Failed to export summary: {e}")
            self.logger.debug(traceback.format_exc())
            return ""

    def export_summary_with_counts(self, export_path):
        """Exports the summary with counts to a single Excel sheet."""
        summary_excel_path = os.path.join(export_path, "Summary_with_Counts.xlsx")
        try:
            with pd.ExcelWriter(summary_excel_path, engine='xlsxwriter') as writer:
                # Initialize starting row
                startrow = 0

                # Overall summary
                summary_df = pd.DataFrame([self.summary])
                summary_df.to_excel(writer, sheet_name='Summary', index=False, startrow=startrow)
                startrow += len(summary_df) + 2  # Add space between tables

                if self.paired_df is not None:
                    # Pairing mode
                    # Group summaries
                    group_summaries = []
                    age_distribution_data = []

                    for group_name, pairs in self.groups.items():
                        male_count = 0
                        female_count = 0
                        age_gender_counts = {}

                        for pair in pairs:
                            for animal_key in ['Animal 1', 'Animal 2']:
                                animal = pair[animal_key]
                                sex = animal['Sex'].strip().lower()
                                age = animal['Age (w)']

                                # Count sexes
                                if sex == 'male':
                                    male_count += 1
                                elif sex == 'female':
                                    female_count += 1

                                # Age and gender distribution
                                if age not in age_gender_counts:
                                    age_gender_counts[age] = {'Males': 0, 'Females': 0}
                                if sex == 'male':
                                    age_gender_counts[age]['Males'] += 1
                                elif sex == 'female':
                                    age_gender_counts[age]['Females'] += 1

                        group_summaries.append({
                            'Group Name': group_name,
                            'Number of Animals': male_count + female_count,
                            'Males': male_count,
                            'Females': female_count
                        })

                        # Prepare age distribution data
                        for age, counts in age_gender_counts.items():
                            age_distribution_data.append({
                                'Group Name': group_name,
                                'Age (w)': age,
                                'Males': counts['Males'],
                                'Females': counts['Females']
                            })

                    group_summaries_df = pd.DataFrame(group_summaries)
                    age_distribution_df = pd.DataFrame(age_distribution_data)

                    # Write group summaries
                    group_summaries_df.to_excel(writer, sheet_name='Summary', index=False, startrow=startrow)
                    startrow += len(group_summaries_df) + 2  # Add space between tables

                    # Write age distribution summaries
                    age_distribution_df.to_excel(writer, sheet_name='Summary', index=False, startrow=startrow)

                else:
                    # Distribution mode
                    # Group summaries
                    group_summaries = []
                    age_distribution_data = []

                    for group_name, animals in self.groups.items():
                        male_count = sum(1 for animal in animals if animal['Sex'].strip().lower() == 'male')
                        female_count = sum(1 for animal in animals if animal['Sex'].strip().lower() == 'female')

                        # Age distribution
                        age_gender_counts = {}
                        for animal in animals:
                            sex = animal['Sex'].strip().lower()
                            age = animal['Age (w)']

                            if age not in age_gender_counts:
                                age_gender_counts[age] = {'Males': 0, 'Females': 0}
                            if sex == 'male':
                                age_gender_counts[age]['Males'] += 1
                            elif sex == 'female':
                                age_gender_counts[age]['Females'] += 1

                        group_summaries.append({
                            'Group Name': group_name,
                            'Number of Animals': male_count + female_count,
                            'Males': male_count,
                            'Females': female_count
                        })

                        # Prepare age distribution data
                        for age, counts in age_gender_counts.items():
                            age_distribution_data.append({
                                'Group Name': group_name,
                                'Age (w)': age,
                                'Males': counts['Males'],
                                'Females': counts['Females']
                            })

                    group_summaries_df = pd.DataFrame(group_summaries)
                    age_distribution_df = pd.DataFrame(age_distribution_data)

                    # Write group summaries
                    group_summaries_df.to_excel(writer, sheet_name='Summary', index=False, startrow=startrow)
                    startrow += len(group_summaries_df) + 2  # Add space between tables

                    # Write age distribution summaries
                    age_distribution_df.to_excel(writer, sheet_name='Summary', index=False, startrow=startrow)

            return summary_excel_path
        except Exception as e:
            messagebox.showerror("Export Error", f"Failed to export summary.\n{e}")
            self.logger.error(f"Failed to export summary: {e}")
            self.logger.debug(traceback.format_exc())
            return ""

    def display_summary(self, paired_df, unpaired_df, groups, summary):
        """Displays the summary of pairing and grouping in the GUI."""
        try:
            self.summary_text.delete(1.0, tk.END)
            if paired_df is not None:
                # Pairing case
                self.summary_text.insert(tk.END, "=== Pairing and Grouping Summary ===\n\n")
                self.summary_text.insert(tk.END, f"Total Pairs: {summary.get('Total Pairs', 0)}\n")
                self.summary_text.insert(tk.END, f"Total Unpaired Animals: {summary.get('Total Unpaired', 0)}\n\n")
            else:
                # Distribution case
                self.summary_text.insert(tk.END, "=== Distribution Summary ===\n\n")
                self.summary_text.insert(tk.END, f"Total Animals: {summary.get('Total Animals', 0)}\n\n")

            self.summary_text.insert(tk.END, "=== Groups ===\n")
            for group_name, items in groups.items():
                if paired_df is not None:
                    # Pairing mode
                    count = len(items) * 2  # Each pair has two animals
                    male_count = 0
                    female_count = 0
                    age_gender_counts = {}

                    for pair in items:
                        for animal_key in ['Animal 1', 'Animal 2']:
                            animal = pair[animal_key]
                            sex = animal['Sex'].strip().lower()
                            age = animal['Age (w)']

                            # Count sexes
                            if sex == 'male':
                                male_count += 1
                            elif sex == 'female':
                                female_count += 1

                            # Age and gender distribution
                            if age not in age_gender_counts:
                                age_gender_counts[age] = {'Males': 0, 'Females': 0}
                            if sex == 'male':
                                age_gender_counts[age]['Males'] += 1
                            elif sex == 'female':
                                age_gender_counts[age]['Females'] += 1

                    # Display group information
                    self.summary_text.insert(tk.END, f"\nGroup: {group_name}\n")
                    self.summary_text.insert(tk.END, f"Number of Animals: {count}\n")
                    self.summary_text.insert(tk.END, f"Males: {male_count}\n")
                    self.summary_text.insert(tk.END, f"Females: {female_count}\n")
                    self.summary_text.insert(tk.END, "Age Distribution:\n")
                    for age in sorted(age_gender_counts.keys()):
                        self.summary_text.insert(tk.END, f"  {age} weeks:\n")
                        self.summary_text.insert(tk.END, f"    Males: {age_gender_counts[age]['Males']}\n")
                        self.summary_text.insert(tk.END, f"    Females: {age_gender_counts[age]['Females']}\n")

                    # List the animals
                    self.summary_text.insert(tk.END, "  Animals:\n")
                    idx = 1
                    for pair in items:
                        for animal_key in ['Animal 1', 'Animal 2']:
                            animal = pair[animal_key]
                            self.summary_text.insert(tk.END,
                                                     f"    {idx}: ID {animal['Animal ID No.']} "
                                                     f"({animal['Sex']}, {animal['Age (w)']}w)\n")
                            idx += 1
                else:
                    # Distribution mode
                    count = len(items)
                    male_count = sum(1 for item in items if item['Sex'].strip().lower() == 'male')
                    female_count = sum(1 for item in items if item['Sex'].strip().lower() == 'female')
                    age_gender_counts = {}

                    for item in items:
                        sex = item['Sex'].strip().lower()
                        age = item['Age (w)']

                        # Age and gender distribution
                        if age not in age_gender_counts:
                            age_gender_counts[age] = {'Males': 0, 'Females': 0}
                        if sex == 'male':
                            age_gender_counts[age]['Males'] += 1
                        elif sex == 'female':
                            age_gender_counts[age]['Females'] += 1

                    # Display group information
                    self.summary_text.insert(tk.END, f"\nGroup: {group_name}\n")
                    self.summary_text.insert(tk.END, f"Number of Animals: {count}\n")
                    self.summary_text.insert(tk.END, f"Males: {male_count}\n")
                    self.summary_text.insert(tk.END, f"Females: {female_count}\n")
                    self.summary_text.insert(tk.END, "Age Distribution:\n")
                    for age in sorted(age_gender_counts.keys()):
                        self.summary_text.insert(tk.END, f"  {age} weeks:\n")
                        self.summary_text.insert(tk.END, f"    Males: {age_gender_counts[age]['Males']}\n")
                        self.summary_text.insert(tk.END, f"    Females: {age_gender_counts[age]['Females']}\n")

                    # List the animals
                    self.summary_text.insert(tk.END, "  Animals:\n")
                    for idx, item in enumerate(items, 1):
                        self.summary_text.insert(tk.END,
                                                 f"    {idx}: ID {item['Animal ID No.']} "
                                                 f"({item['Sex']}, {item['Age (w)']}w)\n")

            self.logger.info("Summary displayed in GUI.")
        except KeyError as e:
            messagebox.showerror("Data Error", f"Missing key in summary data: {e}")
            self.logger.error(f"Missing key in summary data: {e}")
        except AttributeError as e:
            messagebox.showerror("Attribute Error", f"Missing attribute: {e}")
            self.logger.error(f"Attribute error: {e}")
        except Exception as e:
            messagebox.showerror("Error", f"An unexpected error occurred while displaying summary.\n{e}")
            self.logger.error(f"Unexpected error during displaying summary: {e}")
            self.logger.debug(traceback.format_exc())

if __name__ == "__main__":
    root = tk.Tk()
    app = AnimalPairingApp(root)
    root.mainloop()
