--
-- PostgreSQL database dump
--

\restrict yFfyPK2HZnIiGGXd2oIdy3tE990gFwR6lmWhEJq6yKx6YKD0tQ4pKq4myIgIuEf

-- Dumped from database version 18.3 (Debian 18.3-1.pgdg13+1)
-- Dumped by pg_dump version 18.3 (Debian 18.3-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: build_task_selection(integer, integer, date, integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.build_task_selection(p_vehicle_id integer, p_current_odo integer, p_current_date date, p_odo_buffer integer DEFAULT 0, p_days_buffer integer DEFAULT 0) RETURNS integer[]
    LANGUAGE sql
    AS $$
SELECT ARRAY_AGG(task_id)
FROM preview_due_tasks(
    p_vehicle_id,
    p_current_odo,
    p_current_date,
    p_odo_buffer,
    p_days_buffer
)
WHERE include_flag = TRUE;
$$;


ALTER FUNCTION public.build_task_selection(p_vehicle_id integer, p_current_odo integer, p_current_date date, p_odo_buffer integer, p_days_buffer integer) OWNER TO postgres;

--
-- Name: complete_work_order(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.complete_work_order(p_order_id integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_already_completed BOOLEAN;
BEGIN
    -- ≡ƒöÆ Guard: prevent double completion
    SELECT completed INTO v_already_completed
    FROM workorder_header
    WHERE order_id = p_order_id;

    IF v_already_completed THEN
        RAISE EXCEPTION 
        'Work order % is already completed. Reopen it before completing again.',
        p_order_id;
    END IF;

    -- Γ£à Update maintenance_status
    INSERT INTO maintenance_status (task_id, last_performed_odo, last_performed_date)
    SELECT
        wml.task_id,
        woh.odo_reading,
        woh.order_date::date
    FROM workorder_maintenance_list wml
    JOIN workorder_header woh
        ON woh.order_id = wml.order_id
    WHERE wml.order_id = p_order_id
    ON CONFLICT (task_id)
	DO UPDATE SET
   		last_performed_odo  = EXCLUDED.last_performed_odo,
    	last_performed_date = EXCLUDED.last_performed_date
	WHERE
    	EXCLUDED.last_performed_odo  > maintenance_status.last_performed_odo
   		OR EXCLUDED.last_performed_date > maintenance_status.last_performed_date;

    -- ≡ƒÆ░ Update total cost
    UPDATE workorder_header woh
    SET total_cost = COALESCE((
        SELECT SUM(cost)
        FROM workorder_costs wc
        WHERE wc.order_id = woh.order_id
    ), 0)
    WHERE woh.order_id = p_order_id;

    -- Γ£à Mark completed
    UPDATE workorder_header
    SET completed = TRUE
    WHERE order_id = p_order_id;

END;
$$;


ALTER FUNCTION public.complete_work_order(p_order_id integer) OWNER TO postgres;

--
-- Name: create_work_order_auto(integer, integer, integer, date, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_work_order_auto(p_vehicle_id integer, p_garage_id integer, p_odo integer, p_order_date date, p_notes text DEFAULT NULL::text) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_order_id INT;
BEGIN
    -- Create header
    INSERT INTO workorder_header (
        vehicle_id,
        garage_id,
        order_date,
        odo_reading,
        notes
    )
    VALUES (
        p_vehicle_id,
        p_garage_id,
        p_order_date,
        p_odo,
        p_notes
    )
    RETURNING order_id INTO v_order_id;

    -- Insert due tasks
    INSERT INTO workorder_maintenance_list (
        order_id,
        task_id,
        vehicle_id
    )
    SELECT
        v_order_id,
        dt.task_id,
        p_vehicle_id
    FROM get_due_tasks(p_vehicle_id, p_odo, p_order_date) dt;

    RETURN v_order_id;
END;
$$;


ALTER FUNCTION public.create_work_order_auto(p_vehicle_id integer, p_garage_id integer, p_odo integer, p_order_date date, p_notes text) OWNER TO postgres;

--
-- Name: create_work_order_from_selection(integer, integer, integer, date, integer[], text, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_work_order_from_selection(p_vehicle_id integer, p_garage_id integer, p_odo integer, p_order_date date, p_task_ids integer[], p_notes text DEFAULT NULL::text, p_strict_mode boolean DEFAULT false) RETURNS TABLE(order_id integer, task_count integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_order_id INT;
    v_invalid_count INT;
BEGIN
    -- Validate: tasks belong to vehicle
    SELECT COUNT(*) INTO v_invalid_count
    FROM unnest(p_task_ids) AS t(task_id)
    LEFT JOIN maintenance_schedule ms
        ON ms.task_id = t.task_id
    WHERE ms.vehicle_id IS NULL
       OR ms.vehicle_id <> p_vehicle_id;

    IF v_invalid_count > 0 THEN
        RAISE EXCEPTION 
        'One or more tasks are invalid for vehicle_id %',
        p_vehicle_id;
    END IF;

    -- Optional strict validation
    IF p_strict_mode THEN
        SELECT COUNT(*) INTO v_invalid_count
        FROM unnest(p_task_ids) AS t(task_id)
        LEFT JOIN get_due_tasks(p_vehicle_id, p_odo, p_order_date) dt
            ON dt.task_id = t.task_id
        WHERE dt.task_id IS NULL;

        IF v_invalid_count > 0 THEN
            RAISE EXCEPTION 
            'One or more selected tasks are no longer due based on current inputs';
        END IF;
    END IF;

    -- Create header
    INSERT INTO workorder_header (
        vehicle_id,
        garage_id,
        order_date,
        odo_reading,
        notes
    )
    VALUES (
        p_vehicle_id,
        p_garage_id,
        p_order_date,
        p_odo,
        p_notes
    )
    RETURNING workorder_header.order_id INTO v_order_id;

    -- Insert selected tasks
    INSERT INTO workorder_maintenance_list (
        order_id,
        task_id,
        vehicle_id
    )
    SELECT
        v_order_id,
        t.task_id,
        p_vehicle_id
    FROM unnest(p_task_ids) AS t(task_id);

    -- Return result
    RETURN QUERY
    SELECT 
        v_order_id AS order_id,
        COUNT(*)::INT AS task_count
    FROM unnest(p_task_ids);
END;
$$;


ALTER FUNCTION public.create_work_order_from_selection(p_vehicle_id integer, p_garage_id integer, p_odo integer, p_order_date date, p_task_ids integer[], p_notes text, p_strict_mode boolean) OWNER TO postgres;

--
-- Name: create_work_order_quick(integer, integer, integer, date); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_work_order_quick(p_vehicle_id integer, p_garage_id integer, p_odo integer, p_order_date date) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_order_id INT;
BEGIN
    SELECT create_work_order_from_selection(
        p_vehicle_id,
        p_garage_id,
        p_odo,
        p_order_date,
        ARRAY(
            SELECT task_id
            FROM preview_due_tasks(p_vehicle_id, p_odo, p_order_date, 0, 0)
        )
    )
    INTO v_order_id;

    RETURN v_order_id;
END;
$$;


ALTER FUNCTION public.create_work_order_quick(p_vehicle_id integer, p_garage_id integer, p_odo integer, p_order_date date) OWNER TO postgres;

--
-- Name: get_due_tasks(integer, integer, date); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_due_tasks(p_vehicle_id integer, p_current_odo integer, p_current_date date) RETURNS TABLE(task_id integer, task_description character varying, calculated_next_due_odo integer, calculated_next_due_date date)
    LANGUAGE sql
    AS $$
SELECT
    v.task_id,
    v.task_description,
    v.calculated_next_due_odo,
    v.calculated_next_due_date
FROM vw_tasks_due v
WHERE v.vehicle_id = p_vehicle_id
AND (
    (v.calculated_next_due_odo IS NOT NULL AND v.calculated_next_due_odo <= p_current_odo)
    OR
    (v.calculated_next_due_date IS NOT NULL AND v.calculated_next_due_date <= p_current_date)
);
$$;


ALTER FUNCTION public.get_due_tasks(p_vehicle_id integer, p_current_odo integer, p_current_date date) OWNER TO postgres;

--
-- Name: get_due_tasks(integer, integer, date, integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_due_tasks(p_vehicle_id integer, p_current_odo integer, p_current_date date, p_odo_buffer integer, p_days_buffer integer) RETURNS TABLE(task_id integer, task_description character varying, due_by_odo boolean, due_by_date boolean, calculated_next_due_odo integer, calculated_next_due_date date)
    LANGUAGE sql
    AS $$
SELECT
    v.task_id,
    v.task_description,

    (v.calculated_next_due_odo IS NOT NULL 
     AND v.calculated_next_due_odo <= p_current_odo + p_odo_buffer),

    (v.calculated_next_due_date IS NOT NULL 
     AND v.calculated_next_due_date <= p_current_date + p_days_buffer),

    v.calculated_next_due_odo,
    v.calculated_next_due_date

FROM vw_tasks_due v
WHERE v.vehicle_id = p_vehicle_id
AND (
    (v.calculated_next_due_odo IS NOT NULL 
     AND v.calculated_next_due_odo <= p_current_odo + p_odo_buffer)
    OR
    (v.calculated_next_due_date IS NOT NULL 
     AND v.calculated_next_due_date <= p_current_date + p_days_buffer)
);
$$;


ALTER FUNCTION public.get_due_tasks(p_vehicle_id integer, p_current_odo integer, p_current_date date, p_odo_buffer integer, p_days_buffer integer) OWNER TO postgres;

--
-- Name: prevent_changes_if_completed(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.prevent_changes_if_completed() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_completed BOOLEAN;
BEGIN
    -- Get order_id depending on operation
    IF TG_OP = 'DELETE' THEN
        SELECT completed INTO v_completed
        FROM workorder_header
        WHERE order_id = OLD.order_id;
    ELSE
        SELECT completed INTO v_completed
        FROM workorder_header
        WHERE order_id = NEW.order_id;
    END IF;

    IF v_completed THEN
        RAISE EXCEPTION 'Cannot modify a completed work order (order_id=%)', 
            COALESCE(NEW.order_id, OLD.order_id);
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION public.prevent_changes_if_completed() OWNER TO postgres;

--
-- Name: preview_due_tasks(integer, integer, date, integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.preview_due_tasks(p_vehicle_id integer, p_current_odo integer, p_current_date date, p_odo_buffer integer DEFAULT 0, p_days_buffer integer DEFAULT 0) RETURNS TABLE(task_id integer, task_description text, due_by_odo boolean, due_by_date boolean, calculated_next_due_odo integer, calculated_next_due_date date, include_flag boolean)
    LANGUAGE sql
    AS $$
SELECT
    dt.task_id,
    dt.task_description,
    dt.due_by_odo,
    dt.due_by_date,
    dt.calculated_next_due_odo,
    dt.calculated_next_due_date,
    TRUE AS include_flag
	
FROM get_due_tasks(
    p_vehicle_id,
    p_current_odo,
    p_current_date,
    p_odo_buffer,
    p_days_buffer
) dt

-- ≡ƒöÑ THIS IS THE FIX
WHERE NOT EXISTS (
    SELECT 1
    FROM maintenance_schedule ms
    JOIN workorder_maintenance_list wml
        ON wml.task_id = ms.task_id
    JOIN workorder_header woh
        ON woh.order_id = wml.order_id
    WHERE ms.task_id = dt.task_id
      AND ms.vehicle_id = p_vehicle_id
      AND ms.is_one_time = true
      AND woh.completed = true
);

$$;


ALTER FUNCTION public.preview_due_tasks(p_vehicle_id integer, p_current_odo integer, p_current_date date, p_odo_buffer integer, p_days_buffer integer) OWNER TO postgres;

--
-- Name: reopen_work_order(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.reopen_work_order(p_order_id integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_conflict_count INT;
BEGIN
    -- Check if any task has been updated by a newer work order
    SELECT COUNT(*) INTO v_conflict_count
    FROM maintenance_status ms
    JOIN workorder_maintenance_list wml 
        ON ms.task_id = wml.task_id
    JOIN workorder_header woh 
        ON woh.order_id = wml.order_id
    WHERE wml.order_id = p_order_id
      AND (
            ms.last_performed_date > woh.order_date
         OR ms.last_performed_odo > woh.odo_reading
      );

    IF v_conflict_count > 0 THEN
        RAISE EXCEPTION 
        'Cannot reopen: newer maintenance exists for one or more tasks';
    END IF;

    -- Clear maintenance_status for affected tasks
    DELETE FROM maintenance_status ms
    USING workorder_maintenance_list wml
    WHERE ms.task_id = wml.task_id
      AND wml.order_id = p_order_id;

    -- Mark work order as not completed
    UPDATE workorder_header
    SET completed = FALSE
    WHERE order_id = p_order_id;

END;
$$;


ALTER FUNCTION public.reopen_work_order(p_order_id integer) OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: garage; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.garage (
    garage_id integer CONSTRAINT "garage_GarageID_not_null" NOT NULL,
    name character varying(50),
    address1 character varying(50),
    address2 character varying(50),
    contact character varying(32767)
);


ALTER TABLE public.garage OWNER TO postgres;

--
-- Name: garage_garage_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.garage ALTER COLUMN garage_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.garage_garage_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: maintenance_schedule; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.maintenance_schedule (
    task_id integer CONSTRAINT "maintenanceschedule_TaskID_not_null" NOT NULL,
    vehicle_id integer CONSTRAINT "maintenanceschedule_VehicleID_not_null" NOT NULL,
    task_description character varying(50),
    odo_interval integer,
    notes character varying(32767),
    time_interval interval,
    is_one_time boolean DEFAULT false
);


ALTER TABLE public.maintenance_schedule OWNER TO postgres;

--
-- Name: maintenance_schedule_task_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.maintenance_schedule ALTER COLUMN task_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.maintenance_schedule_task_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: maintenance_status; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.maintenance_status (
    task_id integer NOT NULL,
    last_performed_odo integer,
    last_performed_date date
);


ALTER TABLE public.maintenance_status OWNER TO postgres;

--
-- Name: vehicles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vehicles (
    vehicle_id integer CONSTRAINT "vehicles_VehicleID_not_null" NOT NULL,
    make character varying(50),
    model character varying(50),
    year integer,
    vin character varying(50),
    purchase_date timestamp without time zone CONSTRAINT "vehicles_PurchaseDate_not_null" NOT NULL
);


ALTER TABLE public.vehicles OWNER TO postgres;

--
-- Name: vehicles_vehicle_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.vehicles ALTER COLUMN vehicle_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.vehicles_vehicle_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: vw_tasks_due; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.vw_tasks_due AS
 SELECT ms.task_id,
    ms.vehicle_id,
    ms.task_description,
    COALESCE(st.last_performed_odo, 0) AS effective_last_odo,
    ms.odo_interval,
        CASE
            WHEN (ms.odo_interval IS NOT NULL) THEN (COALESCE(st.last_performed_odo, 0) + ms.odo_interval)
            ELSE NULL::integer
        END AS calculated_next_due_odo,
    COALESCE(st.last_performed_date, (v.purchase_date)::date) AS effective_last_date,
    ms.time_interval,
        CASE
            WHEN (ms.time_interval IS NOT NULL) THEN (COALESCE(st.last_performed_date, (v.purchase_date)::date) + ms.time_interval)
            ELSE NULL::timestamp without time zone
        END AS calculated_next_due_date
   FROM ((public.maintenance_schedule ms
     JOIN public.vehicles v ON ((ms.vehicle_id = v.vehicle_id)))
     LEFT JOIN public.maintenance_status st ON ((ms.task_id = st.task_id)));


ALTER VIEW public.vw_tasks_due OWNER TO postgres;

--
-- Name: workorder_header; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.workorder_header (
    order_id integer CONSTRAINT "workorderheader_OrderID_not_null" NOT NULL,
    vehicle_id integer CONSTRAINT "workorderheader_VehicleID_not_null" NOT NULL,
    garage_id integer CONSTRAINT "workorderheader_GarageID_not_null" NOT NULL,
    order_date timestamp without time zone,
    odo_reading integer,
    notes character varying(32767),
    completed boolean DEFAULT false,
    total_cost numeric(10,2) DEFAULT 0
);


ALTER TABLE public.workorder_header OWNER TO postgres;

--
-- Name: vw_vehicle_summary; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.vw_vehicle_summary AS
 SELECT v.vehicle_id,
    v.make,
    v.model,
    (v.year)::text AS year,
    count(DISTINCT woh.order_id) AS total_work_orders,
    sum(woh.total_cost) AS total_spent,
    max(woh.order_date) AS last_service_date
   FROM (public.vehicles v
     LEFT JOIN public.workorder_header woh ON ((v.vehicle_id = woh.vehicle_id)))
  GROUP BY v.vehicle_id, v.make, v.model, v.year;


ALTER VIEW public.vw_vehicle_summary OWNER TO postgres;

--
-- Name: workorder_maintenance_list; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.workorder_maintenance_list (
    order_id integer CONSTRAINT "workordermaintenancelist_OrderID_not_null" NOT NULL,
    task_id integer CONSTRAINT "workordermaintenancelist_TaskID_not_null" NOT NULL,
    workorder_maintenance_list_id integer CONSTRAINT "workordermaintenancelist_WorkOrderMaintenanceListID_not_null" NOT NULL,
    vehicle_id integer NOT NULL
);


ALTER TABLE public.workorder_maintenance_list OWNER TO postgres;

--
-- Name: vw_vehicle_work_history; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.vw_vehicle_work_history AS
 SELECT v.vehicle_id,
    v.make,
    v.model,
    v.year,
    woh.order_id,
    woh.order_date,
    woh.odo_reading,
    woh.completed,
    woh.total_cost,
    g.name AS garage_name,
    wml.task_id,
    ms.task_description
   FROM ((((public.workorder_header woh
     JOIN public.vehicles v ON ((woh.vehicle_id = v.vehicle_id)))
     JOIN public.garage g ON ((woh.garage_id = g.garage_id)))
     LEFT JOIN public.workorder_maintenance_list wml ON ((woh.order_id = wml.order_id)))
     LEFT JOIN public.maintenance_schedule ms ON ((wml.task_id = ms.task_id)));


ALTER VIEW public.vw_vehicle_work_history OWNER TO postgres;

--
-- Name: workorder_costs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.workorder_costs (
    order_id integer CONSTRAINT "workordercosts_OrderID_not_null" NOT NULL,
    description text,
    cost numeric(10,2),
    workorder_costs_id integer NOT NULL,
    cost_type text
);


ALTER TABLE public.workorder_costs OWNER TO postgres;

--
-- Name: vw_workorder_print; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.vw_workorder_print AS
 SELECT woh.order_id,
    woh.order_date,
    woh.odo_reading,
    woh.completed,
    woh.total_cost,
    v.vehicle_id,
    v.make,
    v.model,
    (v.year)::text AS year,
    v.vin,
    g.name AS garage_name,
    g.address1,
    g.address2,
    g.contact,
    'TASK'::text AS line_type,
    wml.task_id,
    ms.task_description AS description,
    NULL::numeric AS cost,
    NULL::text AS cost_type
   FROM ((((public.workorder_header woh
     JOIN public.vehicles v ON ((woh.vehicle_id = v.vehicle_id)))
     JOIN public.garage g ON ((woh.garage_id = g.garage_id)))
     LEFT JOIN public.workorder_maintenance_list wml ON ((woh.order_id = wml.order_id)))
     LEFT JOIN public.maintenance_schedule ms ON ((wml.task_id = ms.task_id)))
UNION ALL
 SELECT woh.order_id,
    woh.order_date,
    woh.odo_reading,
    woh.completed,
    woh.total_cost,
    v.vehicle_id,
    v.make,
    v.model,
    (v.year)::text AS year,
    v.vin,
    g.name AS garage_name,
    g.address1,
    g.address2,
    g.contact,
    'COST'::text AS line_type,
    NULL::integer AS task_id,
    workorder_costs.description,
    workorder_costs.cost,
    workorder_costs.cost_type
   FROM (((public.workorder_header woh
     JOIN public.vehicles v ON ((woh.vehicle_id = v.vehicle_id)))
     JOIN public.garage g ON ((woh.garage_id = g.garage_id)))
     JOIN public.workorder_costs ON ((woh.order_id = workorder_costs.order_id)));


ALTER VIEW public.vw_workorder_print OWNER TO postgres;

--
-- Name: workorder_costs_workorder_costs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.workorder_costs ALTER COLUMN workorder_costs_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.workorder_costs_workorder_costs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: workorder_header_order_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.workorder_header ALTER COLUMN order_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.workorder_header_order_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: workorder_maintenance_list_workorder_maintenance_list_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.workorder_maintenance_list ALTER COLUMN workorder_maintenance_list_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.workorder_maintenance_list_workorder_maintenance_list_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: garage garage_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.garage
    ADD CONSTRAINT garage_pk PRIMARY KEY (garage_id);


--
-- Name: maintenance_status maintenance_status_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.maintenance_status
    ADD CONSTRAINT maintenance_status_pk PRIMARY KEY (task_id);


--
-- Name: maintenance_schedule maintenanceschedule_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.maintenance_schedule
    ADD CONSTRAINT maintenanceschedule_pk PRIMARY KEY (task_id);


--
-- Name: maintenance_schedule uq_vehicle_task; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.maintenance_schedule
    ADD CONSTRAINT uq_vehicle_task UNIQUE (vehicle_id, task_id);


--
-- Name: vehicles vehicles_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_pk PRIMARY KEY (vehicle_id);


--
-- Name: workorder_costs workordercosts_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workorder_costs
    ADD CONSTRAINT workordercosts_pk PRIMARY KEY (workorder_costs_id);


--
-- Name: workorder_header workorderheader_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workorder_header
    ADD CONSTRAINT workorderheader_pk PRIMARY KEY (order_id);


--
-- Name: workorder_maintenance_list workordermaintenancelist_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workorder_maintenance_list
    ADD CONSTRAINT workordermaintenancelist_pk PRIMARY KEY (workorder_maintenance_list_id);


--
-- Name: idx_wml_task; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_wml_task ON public.workorder_maintenance_list USING btree (task_id);


--
-- Name: workorder_costs trg_wc_prevent_changes; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_wc_prevent_changes BEFORE INSERT OR DELETE OR UPDATE ON public.workorder_costs FOR EACH ROW EXECUTE FUNCTION public.prevent_changes_if_completed();


--
-- Name: workorder_maintenance_list trg_wml_prevent_changes; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_wml_prevent_changes BEFORE INSERT OR DELETE OR UPDATE ON public.workorder_maintenance_list FOR EACH ROW EXECUTE FUNCTION public.prevent_changes_if_completed();


--
-- Name: workorder_maintenance_list fk_wml_vehicle_task; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workorder_maintenance_list
    ADD CONSTRAINT fk_wml_vehicle_task FOREIGN KEY (vehicle_id, task_id) REFERENCES public.maintenance_schedule(vehicle_id, task_id);


--
-- Name: maintenance_schedule maintenance_schedule_vehicles_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.maintenance_schedule
    ADD CONSTRAINT maintenance_schedule_vehicles_fk FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(vehicle_id);


--
-- Name: maintenance_status maintenance_status_maintenance_schedule_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.maintenance_status
    ADD CONSTRAINT maintenance_status_maintenance_schedule_fk FOREIGN KEY (task_id) REFERENCES public.maintenance_schedule(task_id);


--
-- Name: workorder_costs workorder_costs_workorder_header_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workorder_costs
    ADD CONSTRAINT workorder_costs_workorder_header_fk FOREIGN KEY (order_id) REFERENCES public.workorder_header(order_id);


--
-- Name: workorder_header workorder_header_garage_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workorder_header
    ADD CONSTRAINT workorder_header_garage_fk FOREIGN KEY (garage_id) REFERENCES public.garage(garage_id);


--
-- Name: workorder_header workorder_header_vehicles_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workorder_header
    ADD CONSTRAINT workorder_header_vehicles_fk FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(vehicle_id);


--
-- Name: workorder_maintenance_list workorder_maintenance_list_workorder_header_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workorder_maintenance_list
    ADD CONSTRAINT workorder_maintenance_list_workorder_header_fk FOREIGN KEY (order_id) REFERENCES public.workorder_header(order_id);


--
-- PostgreSQL database dump complete
--

\unrestrict yFfyPK2HZnIiGGXd2oIdy3tE990gFwR6lmWhEJq6yKx6YKD0tQ4pKq4myIgIuEf

