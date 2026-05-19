# Wrench VMT

**Wrench VMT** — short for Vehicle Maintenance Tracker — is a simple tool to track service and maintenance on vehicles and equipment.

Originally developed in Microsoft Access, this new version features a platform-independent, non-cloud-based web interface freely accessible by any device on your local network.

![Wrench VMT Screenshot](https://github.com/user-attachments/assets/6c99ad03-9545-43be-9cdd-c29e7773698f)

---

## The Basic Idea

After entering vehicle, garage, and maintenance information, the app recommends maintenance based on the last time each item was performed — or from the vehicle's purchase date if no service history exists yet.

---

## Key Workflows

### Initial Data Load

Before creating work orders, three tables need to be populated:

- **Garages** — locations and contact information where maintenance will be performed. A garage entry is required before creating a work order.
- **Vehicles** — make, model, serial number, and purchase date.
- **Maintenance Schedule** — usually transcribed from the owner's manual. Each item has a use-based interval, a time-based interval, or both (whichever comes first).

### Work Order Creation and Completion

1. Select a garage and a vehicle
2. Enter the vehicle's current odometer or hour meter reading
3. The app uses the date of last maintenance (or purchase date if no history exists) to identify time-sensitive items that are due
4. The app uses the current odometer/hour reading to identify use-based items that are due
5. Recommended maintenance items are displayed in the Tasks section
6. Optionally check **Upcoming** and enter use/time buffers to surface items that are coming due soon
7. Optionally check **Show all scheduled tasks** to see the complete maintenance schedule regardless of interval — useful for combining related tasks
8. Optionally add unplanned repairs or supply costs in the **Cost Line Items** section — costs are totalled and recorded on the work order
9. Print the **Work Order Summary** to use as a hard copy while performing the work
10. When the work is complete, click **Complete Work Order**

### Vehicle History Reports

From the **Vehicles** tab, the Vehicle List provides two report buttons per vehicle:

- **Summary** — a condensed list of all completed work orders with dates, odometer readings, and total costs
- **History** — a detailed report of all completed work orders including tasks performed and cost line items

---

## Installation

See [INSTALL.md](INSTALL.md) for full setup instructions.

---

## License

Copyright &copy; 2025 Paolo Benvenuti

This program is free software: you can redistribute it and/or modify it under the terms of the [GNU General Public License v3](https://www.gnu.org/licenses/gpl-3.0.html).

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.

---

## Support This Project

If you find Wrench VMT useful, consider [buying me a coffee](https://www.paypal.com/donate/?business=EV97LDH6TEU5Q&no_recurring=0&currency_code=CAD). ☕
