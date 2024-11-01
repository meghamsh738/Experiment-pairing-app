Animal Pairing and Grouping Tool™
Version 1.0


Table of Contents
Overview
Features
Getting Started
System Requirements
Installation
Using the Installer
Running from Source
Usage
Uploading Data
Selecting Genotypes
Configuring Groups
Processing Pairing
Viewing and Exporting Results
Data Format
Logging
Troubleshooting
Contributing
License
Contact
Overview
Animal Pairing and Grouping Tool™ is a user-friendly desktop application designed to assist researchers, breeders, and animal facility managers in efficiently pairing and grouping animals based on specific genotypes and age criteria. With a simple interface, users can upload animal data, select desired genotypes, configure grouping parameters, and obtain organized results ready for analysis or record-keeping.

Features
Data Upload: Supports Excel (.xlsx, .xls) and CSV (.csv) file formats for easy data import.
Genotype Selection: Dynamically displays available genotypes from uploaded data for selection.
Group Configuration: Allows users to specify the number of groups and assign custom names.
Age Leeway Setting: Facilitates pairing based on age proximity with adjustable leeway in weeks.
Pairing and Grouping: Automatically processes data to create balanced animal pairs and distribute them across configured groups.
Results Summary: Provides a comprehensive summary of pairing and grouping, including counts and age distributions.
Export Functionality: Enables exporting of results to Excel files for further analysis or record maintenance.
Logging: Maintains detailed logs of operations and errors to assist in troubleshooting.
About Dialog: Offers information about the application, including version and developer details.
Getting Started
System Requirements
Operating System: Windows 10 or later (installer available). Python can also run on macOS and Linux if running from source.
Python: Version 3.7 or higher (only required if running from source).
Dependencies: Listed below.
Installation
You have two options to install the Animal Pairing and Grouping Tool™:

Using the Installer
Download the Installer:

Download Link (Replace with actual link if available)
Run the Installer:

Double-click the downloaded installer file.
Follow the on-screen instructions to install the application.
Launch the Application:

After installation, you can launch the tool from the Start Menu or the desktop shortcut (if selected during installation).
Running from Source
If you prefer to run the application from source or need to modify the code:

Clone the Repository:

Use a Git client to clone the repository to your local machine.
Navigate to the Project Directory:

Open your terminal or command prompt and navigate to the project's root directory.
Set Up a Virtual Environment:

Create and activate a virtual environment to manage dependencies.
Install Dependencies:

Install the required Python packages listed in the requirements.txt file.
Run the Application:

Execute the main Python script to launch the application.
Usage
Uploading Data
Open the Application.
Navigate to the "Upload & Configure" Tab.
Click on "Upload Excel/CSV File":
Select your data file in .xlsx, .xls, or .csv format.
Ensure the file contains the necessary columns as specified below.
Selecting Genotypes
After Uploading, the application will display available genotypes.
Check the Boxes next to the genotypes you wish to include in the pairing process.
Configuring Groups
Specify the Number of Groups:

Use the provided controls to select the desired number of groups.
Assign Group Names:

Enter custom names for each group in the provided entry fields.
Set Age Leeway (Weeks):

Define the allowable age difference between paired animals to ensure compatibility.
Processing Pairing
Click on "Process Pairing":
The application will analyze the data based on your configurations.
Upon completion, it will automatically switch to the "Results & Summary" tab.
Viewing and Exporting Results
Review the Summary:

The "Results & Summary" tab displays a detailed overview of the pairing and grouping process, including counts and age distributions.
Export Results:

Click on "Export Results" to save the summaries and group details to Excel files.
Choose your desired export directory when prompted.
Data Format
Ensure your data file includes the following columns:

Animal ID No.: Unique identifier for each animal.
Sex: Gender of the animal (Male or Female).
Genotype: Genetic classification of the animal.
DOB: Date of Birth (format should be consistent and parseable, e.g., DD/MM/YYYY).
Today: Current date or the date of data processing (format should be consistent and parseable).
Age (w): Age in weeks. If absent or incomplete, the application will calculate it based on DOB and Today.
Example CSV Structure:

Animal ID No.	Sex	Genotype	DOB	Today	Age (w)
A001	Male	G1	01/01/2023	01/04/2024	52
A002	Female	G2	15/02/2023	01/04/2024	50
...	...	...	...	...	...
Logging
The application maintains detailed logs to assist with troubleshooting and tracking operations:

Log Files Location: logs/ directory within the application's root folder.
Log Filename Format: animal_pairing_app_YYYYMMDD_HHMMSS.log
Log Contents:
Application start and shutdown events.
File upload successes and failures.
Pairing and grouping operations.
Export actions.
Error messages and stack traces for unexpected issues.
Troubleshooting
If you encounter issues while using the application, consider the following steps:

Check Log Files:

Navigate to the logs/ directory and open the latest log file to identify errors or warnings.
Verify Data Format:

Ensure your data file contains all required columns with correct data types.
Dates should be in a consistent and parseable format.
Ensure Correct Configuration:

Confirm that group names are provided and the number of groups matches your input.
Reinstall the Application:

If issues persist, try reinstalling the application using the installer.
Contact Support:

If you're unable to resolve the issue, reach out via the contact information below.
Contributing
Contributions are welcome! If you'd like to enhance the Animal Pairing and Grouping Tool™, please follow these steps:

Fork the Repository.
Create a Feature Branch.
Commit Your Changes.
Push to the Branch.
Open a Pull Request.
Please ensure that your contributions adhere to the project's coding standards and include appropriate tests where necessary.

License
© 2024 Meghamsh Teja Konda. All rights reserved.

This project is licensed under the MIT License.

Contact
For any questions, suggestions, or support, please contact:

Developer: Meghamsh Teja Konda
Email: your.email@example.com
Website: www.example.com (Replace with actual website if available)
Thank you for using the Animal Pairing and Grouping Tool™! We hope it streamlines your animal management and research processes.
