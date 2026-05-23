# CivicTrack — City of Joburg

> A civic engagement web platform empowering City of Joburg residents to report municipal issues and track infrastructure development across the region.

---

##  Overview

**CivicTrack** is a web application built exclusively for residents of the **City of Johannesburg** municipality. The platform bridges the gap between residents and the city by providing a centralised space to:

- **Report** civic and municipal issues in your area
- **Track** ongoing maintenance work and new development projects across the region
- **Stay informed** on what's happening in your neighbourhood and beyond

> This platform is geo-restricted to the City of Johannesburg municipal boundary. Submissions or access attempts from outside the region are automatically filtered by the system.

---

## Features

### Issue Reporting
Residents can log civic and municipal issues such as:
- Potholes and road damage
- Water and electricity outages
- Illegal dumping and waste management
- Broken streetlights and traffic signals
- Sewage and drainage problems

### Project & Maintenance Tracker
Residents can view and follow:
- Active road and infrastructure maintenance
- New development projects in their ward or suburb
- Status updates on ongoing city projects

### Geo-Restriction
The system restricts access or submissions to within the **City of Johannesburg** municipal boundary, ensuring all data remains relevant and region-specific.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | HTML, CSS, JavaScript |
| **Backend** | Node.js, Express.js |
| **Database** | Microsoft SQL Server (SSMS) |
| **API** | RESTful API via Node Express |


##  Project Structure

```
City Of Joburg CivicTracker/
│
├── Client/
│   ├── Assests/
│   ├── Pages/
│   └── Shared/
│
├── Server/
│   ├── Config
│   ├── Controllers/
│   ├── Middleware/
│   └── Models/
|   
│
├── database/
│   ├── 
│   └── 
│
├── 
├── .gitignore
└── README.md
```

---

## Geo-Restriction

CivicTrack is designed exclusively for **City of Johannesburg** residents. The system uses location-based filtering to verify that users and submitted reports fall within the official CoJ municipal boundary. Any activity detected outside this boundary is automatically restricted.

<p align="center">Built for the people of <strong>Johannesburg</strong> 🇿🇦</p>
