[vehicle_maintenance_project.txt](https://github.com/user-attachments/files/27128842/vehicle_maintenance_project.txt)
Project Overview

Title: Vehicle Maintenance Tracker Migration

	- This app recommends and tracks maintenance and associated costs for multiple vehicles
	- Originally created with Microsoft Access
	- I prefer a custom solution and do not require a "low-code" option.
	- The future app should be open source, locally hosted - preferably in a docker container, with a web/platform-agnostic interface.
	- The current state as defined below was arrived at by trial and error and may not reflect the best approach to achieving the goal. As such it is not meant to describe the technological future state but rather to show how I got here.
	- Additionally, the original app did not have MS Access relationships defined. I found those difficult to work with. Instead, the relationships were established at the "interface-level" by basing forms on queries that made those connections. 
	- In an effort to provide a clearer, initial picture, I recreated the database with tables only and established the relationships in Postgres, and then pg_dumped the db to schema.sql.
	
		
Key workflows

	- Initial data load
		- Garage Table: locations/contact information where maintenance will be performed. Mandatory element of the Work Order workflow
		- Vehicle Table: vehicle information - make/model; serial number; date of purchase
		- Scheduled Maintenance Table: usually transcribed from the owner's manual; maintenance items and there respective intervals; are either use-based, time-based, or both (whichever comes first)

	- Work Order Creation/Completion
		- Select a garage and a vehicle
		- Enter vehicle's current odometer/hour meter reading
		- Date of last maintenance or, barring that, date of purchase used by the app to identify time-sensitive maintenance items that are due
		- Current odometer/hour value used by the app to identify use-based maintenance items that are due
		- The app populates the work order's scheduled tasks list subsection with these recommended maintenance items
		- The user may choose to delete from or add to this list (using a drop-down/combo box) maintenance items that are not recommended at this time
		- The user may also populate a second "Order Costs" subsection of the work order with unplanned repair tasks or costs associated to supplies
		- The costs are totaled and recorded in the Work Order Header
		- When the work is complete, the user marks it as such (boolean/check mark)
		- The work order should be printable so that a hard copy may be referenced while carrying out the work
		
Nice to Have Workflows

	- Vehicle History/Archiving
		- Select a vehicle and produce a detailed report of all related work orders performed with total cost
		- Using the same logic, take the extra step of producing a historical document for archiving and then optionally purging the records from the database, including the vehicle itself.


		
