CREATE TABLE "invoice_line_items" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"position" integer NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit" text,
	"unit_price_cents" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"material_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_line_items_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "invoice_line_items_position_nonnegative" CHECK ("invoice_line_items"."position" >= 0),
	CONSTRAINT "invoice_line_items_description_not_blank" CHECK (btrim("invoice_line_items"."description") <> ''),
	CONSTRAINT "invoice_line_items_quantity_positive" CHECK ("invoice_line_items"."quantity" > 0),
	CONSTRAINT "invoice_line_items_unit_not_blank" CHECK (btrim("invoice_line_items"."unit") <> ''),
	CONSTRAINT "invoice_line_items_unit_price_cents_nonnegative" CHECK ("invoice_line_items"."unit_price_cents" >= 0),
	CONSTRAINT "invoice_line_items_amount_is_quantity_times_price" CHECK ("invoice_line_items"."amount_cents" = round("invoice_line_items"."quantity" * "invoice_line_items"."unit_price_cents"))
);
--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_company_id_invoice_id_currency_fk" FOREIGN KEY ("company_id","invoice_id","currency") REFERENCES "public"."invoices"("company_id","id","currency") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_company_id_material_id_fk" FOREIGN KEY ("company_id","material_id") REFERENCES "public"."materials"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_line_items_invoice_id_position_idx" ON "invoice_line_items" USING btree ("invoice_id","position");--> statement-breakpoint
CREATE INDEX "invoice_line_items_material_id_idx" ON "invoice_line_items" USING btree ("material_id");