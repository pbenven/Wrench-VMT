Work Order Rules

These rules define how work orders affect maintenance tracking and data integrity.

Completion Behavior
- Completing a work order updates maintenance_status for all included maintenance tasks
- The update sets "last performed" values (date and odometer) based on the work order
- A work order cannot be completed more than once without being reopened

Reopen Behavior
- A work order can only be reopened if it is the most recent record affecting its tasks
- Reopening a work order removes its impact on maintenance_status
- Reopening sets the work order to "not completed" and allows editing again

Editing Rules
- A completed work order cannot be modified
    - No adding/removing maintenance tasks
    - No modifying costs
    - No changing odometer or date
- A work order must be reopened before any modifications can be made

Maintenance Logic
- Maintenance tasks may be:
    - time-based
    - usage-based (odometer/hours)
    - or both (whichever comes first)
- If a task has never been performed:
    - time-based calculations use the vehicle purchase_date
    - usage-based calculations assume a starting value of 0

Work Order Creation
- Work orders are created from a "preview" of due tasks
- The user may:
    - accept suggested tasks
    - remove suggested tasks
    - add additional tasks manually

Costs
- Manual cost entries do not affect maintenance scheduling
- Total cost is calculated from all cost entries linked to the work order

Data Integrity
- The system prioritizes historical accuracy over flexibility
- When a work order cannot be reopened, corrections must be made using a new (countering) work order
- Direct database edits are considered a last resort and should be avoided
