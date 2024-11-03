# Animal Pairing and Grouping Tool™

**Version 1.0**

![Animal Pairing and Grouping Tool™ Logo](assets/app_icon.ico)

## Table of Contents
- [Overview](#overview)
- [Features](#features)
- [Getting Started](#getting-started)
  - [System Requirements](#system-requirements)
  - [Installation](#installation)
    - [Using the Installer](#using-the-installer)
    - [Running from Source](#running-from-source)
- [Usage](#usage)
  - [Uploading Data](#uploading-data)
  - [Selecting Genotypes](#selecting-genotypes)
  - [Configuring Groups](#configuring-groups)
  - [Processing Pairing](#processing-pairing)
  - [Viewing and Exporting Results](#viewing-and-exporting-results)
- [Data Format](#data-format)
- [Logging](#logging)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)

## Overview

**Animal Pairing and Grouping Tool™** is a user-friendly desktop application designed to assist researchers, breeders, and animal facility managers in efficiently pairing and grouping animals based on specific genotypes and age criteria. With a simple interface, users can upload animal data, select desired genotypes, configure grouping parameters, and obtain organized results ready for analysis or record-keeping.

## Features

- **Data Upload**: Supports Excel (`.xlsx`, `.xls`) and CSV (`.csv`) file formats for easy data import.
- **Genotype Selection**: Dynamically displays available genotypes from uploaded data for selection.
- **Group Configuration**: Allows users to specify the number of groups and assign custom names.
- **Age Leeway Setting**: Facilitates pairing based on age proximity with adjustable leeway in weeks.
- **Pairing and Grouping**: Automatically processes data to create balanced animal pairs and distribute them across configured groups.
- **Results Summary**: Provides a comprehensive summary of pairing and grouping, including counts and age distributions.
- **Export Functionality**: Enables exporting of results to Excel files for further analysis or record maintenance.
- **Logging**: Maintains detailed logs of operations and errors to assist in troubleshooting.
- **About Dialog**: Offers information about the application, including version and developer details.

## Getting Started

### System Requirements

- **Operating System**: Windows 10 or later (installer available). Python can also run on macOS and Linux if running from source.
- **Python**: Version 3.7 or higher (only required if running from source).
- **Dependencies**: Listed below.

### Installation

You have two options to install the **Animal Pairing and Grouping Tool™**:

#### Using the Installer

1. **Download the Installer**:
   - [[Download Link](https://drive.google.com/file/d/1Zz0SBrQNtAQwzzLRSB_IVMgIeQBxn-3l/view?usp=sharing)

2. **Run the Installer**:
   - Double-click the downloaded installer file.
   - Follow the on-screen instructions to install the application.

3. **Launch the Application**:
   - After installation, you can launch the tool from the Start Menu or the desktop shortcut (if selected during installation).

#### Running from Source

If you prefer to run the application from source or need to modify the code:

1. **Clone the Repository**:
   - Use a Git client to clone the repository to your local machine.

2. **Navigate to the Project Directory**:
   - Open your terminal or command prompt and navigate to the project's root directory.

3. **Set Up a Virtual Environment**:
   - Create and activate a virtual environment to manage dependencies.

4. **Install Dependencies**:
   - Install the required Python packages listed in the `requirements.txt` file.

5. **Run the Application**:
   - Execute the main Python script to launch the application.

## Usage

### Uploading Data

1. **Open the Application**.
2. **Navigate to the "Upload & Configure" Tab**.
3. **Click on "Upload Excel/CSV File"**:
   - Select your data file in `.xlsx`, `.xls`, or `.csv` format.
   - Ensure the file contains the necessary columns as specified below.

### Selecting Genotypes

1. **After Uploading**, the application will display available genotypes.
2. **Check the Boxes** next to the genotypes you wish to include in the pairing process.

### Configuring Groups

1. **Specify the Number of Groups**:
   - Use the provided controls to select the desired number of groups.
   
2. **Assign Group Names**:
   - Enter custom names for each group in the provided entry fields.

3. **Set Age Leeway (Weeks)**:
   - Define the allowable age difference between paired animals to ensure compatibility.

### Processing Pairing

1. **Click on "Process Pairing"**:
   - The application will analyze the data based on your configurations.
   - Upon completion, it will automatically switch to the "Results & Summary" tab.

### Viewing and Exporting Results

1. **Review the Summary**:
   - The "Results & Summary" tab displays a detailed overview of the pairing and grouping process, including counts and age distributions.

2. **Export Results**:
   - Click on "Export Results" to save the summaries and group details to Excel files.
   - Choose your desired export directory when prompted.

## Data Format

Ensure your data file includes the following columns:

- **Animal ID No.**: Unique identifier for each animal.
- **Sex**: Gender of the animal (`Male` or `Female`).
- **Genotype**: Genetic classification of the animal.
- **DOB**: Date of Birth (format should be consistent and parseable, e.g., `DD/MM/YYYY`).
- **Today**: Current date or the date of data processing (format should be consistent and parseable).
- **Age (w)**: Age in weeks. If absent or incomplete, the application will calculate it based on `DOB` and `Today`.

*Example CSV Structure*:

| Animal ID No. | Sex    | Genotype | DOB        | Today      | Age (w) |
|---------------|--------|----------|------------|------------|---------|
| A001          | Male   | G1       | 01/01/2023 | 01/04/2024 | 52      |
| A002          | Female | G2       | 15/02/2023 | 01/04/2024 | 50      |
| ...           | ...    | ...      | ...        | ...        | ...     |

## Logging

The application maintains detailed logs to assist with troubleshooting and tracking operations:

- **Log Files Location**: `logs/` directory within the application's root folder.
- **Log Filename Format**: `animal_pairing_app_YYYYMMDD_HHMMSS.log`
- **Log Contents**:
  - Application start and shutdown events.
  - File upload successes and failures.
  - Pairing and grouping operations.
  - Export actions.
  - Error messages and stack traces for unexpected issues.

## Troubleshooting

If you encounter issues while using the application, consider the following steps:

1. **Check Log Files**:
   - Navigate to the `logs/` directory and open the latest log file to identify errors or warnings.

2. **Verify Data Format**:
   - Ensure your data file contains all required columns with correct data types.
   - Dates should be in a consistent and parseable format.

3. **Ensure Correct Configuration**:
   - Confirm that group names are provided and the number of groups matches your input.

4. **Reinstall the Application**:
   - If issues persist, try reinstalling the application using the installer.

5. **Contact Support**:
   - If you're unable to resolve the issue, reach out via the contact information below.


**Pairing example - In cases of single genotype**:
![image](https://github.com/user-attachments/assets/ab84cde6-a83a-4dc4-92e8-1f0acd46336c)
![image](https://github.com/user-attachments/assets/ffe74a21-e6c6-4d3c-99fe-ddb6e4dd077b)
![image](https://github.com/user-attachments/assets/916a7901-d20b-400c-9664-29cb87a1e6b4)
![image](https://github.com/user-attachments/assets/2fb9bed8-3d74-442c-bf81-d1d8886a96a2)

**Pairing example - In cases of multiple genotype**:
![image](https://github.com/user-attachments/assets/e3e44b43-56a6-4c5f-86a2-7e5f5f945b93)
![image](https://github.com/user-attachments/assets/28da2cde-68ef-4b93-80c4-91eb7d7d9c45)
![image](https://github.com/user-attachments/assets/9cdca6d4-402f-423d-842b-2afd378f611b)
![image](https://github.com/user-attachments/assets/8485e7bf-eba7-4442-8813-aa24805b58a1)
![image](https://github.com/user-attachments/assets/d23d3a19-880b-45d6-b9ec-27d25ffdc1d7)


## Contributing

Contributions are welcome! If you'd like to enhance the **Animal Pairing and Grouping Tool™**, please follow these steps:

1. **Fork the Repository**.
2. **Create a Feature Branch**.
3. **Commit Your Changes**.
4. **Push to the Branch**.
5. **Open a Pull Request**.

Please ensure that your contributions adhere to the project's coding standards and include appropriate tests where necessary.

## License

© 2024 Meghamsh Teja Konda. All rights reserved.

*This project is licensed under the [MIT License](LICENSE).*

## Contact

For any questions, suggestions, or support, please contact:

- **Developer**: Meghamsh Teja Konda
- **Email**: [meghamshteja555@gmail.com](mailto:meghamshteja555@gmail.com)

---

*Thank you for using the Animal Pairing and Grouping Tool™! We hope it streamlines your animal management and research processes.*
