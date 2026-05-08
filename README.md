Wrench Vehicle Maintenance Tracker

The intention was to create a very simple tool to track service and maintenance on vehicles and equipment. It was originally developed with Microsoft Access (many years ago). I decided to migrate the db to PostgreSQL, create a web-based interface, and containered the whole thing. I hope that you may find it useful.

The Basic Idea

	After entering vehicle, garage, and maintenance information, the app will recommend maintenance based on the last time each maintenance item was performed (or from the purchase date)  
	
Key workflows

	- Initial Data Load
		- Garage Table: locations/contact information where maintenance will be performed. Mandatory element of the Work Order workflow
		- Vehicle Table: vehicle information - make/model; serial number; date of purchase
		- Scheduled Maintenance Table: usually transcribed from the owner's manual; maintenance items and there respective intervals; are either use-based, time-based, or both (whichever comes first)

	- Work Order Creation/Completion
		- Select a garage and a vehicle
		- Enter vehicle's current odometer/hour meter reading
		- The date of last maintenance or, barring that, date of purchase is used by the app to identify time-sensitive maintenance items that are due
		- Current odometer/hour value is used by the app to identify use-based maintenance items that are due
		- The app populates the work order's scheduled tasks list subsection with these recommended maintenance items
		- The user may choose to add to this list by checking the "Upcoming" box and entering additional use/time buffers.
		- The app populates the work order's scheduled tasks list subsection with these optional maintenance items
		- The user may choose to add to this list by checking the "Show all scheduled tasks" box. This shows all maintenance items regardless of use/time interval
		- The user may also populate a second "Order Costs" subsection of the work order with unplanned repair tasks or costs associated to supplies
		- The costs are totaled and recorded in the Work Order Header
		- A Work Order Summary may be printed (to use while performing the work)
		- When the work is complete, the user clicks the "Complete Work Order" button

	- View Vehicle History

		- From the Vehicles tab, clicking the Summary button under the Reports column in the Vehicle List will produce a summary report of all work orders performed for that vehicle
		- From the Vehicles tab, clicking the History button under the Reports column in the Vehicle List will produce a detailed report of all work orders performed for that vehicle
