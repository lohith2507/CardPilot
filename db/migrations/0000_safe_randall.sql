CREATE TABLE "cards" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"issuer" text NOT NULL,
	"product" text NOT NULL,
	"network" text NOT NULL,
	"annual_fee_cents" integer DEFAULT 0 NOT NULL,
	"fx_fee_pct" numeric(5, 2) DEFAULT 0 NOT NULL,
	"base_rate" numeric(6, 3) DEFAULT 1 NOT NULL,
	"currency_id" integer NOT NULL,
	"color_from" text,
	"color_to" text,
	"notes" text,
	CONSTRAINT "cards_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "earn_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"card_id" integer NOT NULL,
	"label" text NOT NULL,
	"mcc_codes" integer[] DEFAULT '{}' NOT NULL,
	"merchant_slugs" text[] DEFAULT '{}' NOT NULL,
	"rate" numeric(6, 3) NOT NULL,
	"cap_amount_cents" integer,
	"cap_period" text DEFAULT 'none' NOT NULL,
	"requires_activation" boolean DEFAULT false NOT NULL,
	"selection_group" text,
	"valid_from" date,
	"valid_to" date,
	"priority" integer DEFAULT 0 NOT NULL,
	"source_url" text,
	"verified_at" timestamp with time zone,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"mcc" integer NOT NULL,
	"category" text NOT NULL,
	"network_exclusions" text[] DEFAULT '{}' NOT NULL,
	"issuer_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" text DEFAULT 'seed' NOT NULL,
	"coding_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "point_currencies" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"default_cpp" numeric(6, 3) NOT NULL,
	"user_cpp" numeric(6, 3),
	"is_cashback" boolean DEFAULT false NOT NULL,
	"notes" text,
	CONSTRAINT "point_currencies_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "sub_progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_card_id" integer NOT NULL,
	"required_spend_cents" integer NOT NULL,
	"bonus_value_cents" integer NOT NULL,
	"started_at" date NOT NULL,
	"deadline" date NOT NULL,
	"prelogged_spend_cents" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_card_id" integer NOT NULL,
	"merchant_id" integer,
	"merchant_name" text NOT NULL,
	"mcc" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"earn_rule_id" integer,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_cards" (
	"id" serial PRIMARY KEY NOT NULL,
	"card_id" integer NOT NULL,
	"nickname" text,
	"opened_at" date,
	"active" boolean DEFAULT true NOT NULL,
	"activations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"selections" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_currency_id_point_currencies_id_fk" FOREIGN KEY ("currency_id") REFERENCES "public"."point_currencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "earn_rules" ADD CONSTRAINT "earn_rules_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_progress" ADD CONSTRAINT "sub_progress_user_card_id_user_cards_id_fk" FOREIGN KEY ("user_card_id") REFERENCES "public"."user_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_card_id_user_cards_id_fk" FOREIGN KEY ("user_card_id") REFERENCES "public"."user_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_earn_rule_id_earn_rules_id_fk" FOREIGN KEY ("earn_rule_id") REFERENCES "public"."earn_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_cards" ADD CONSTRAINT "user_cards_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "earn_rules_card_id_idx" ON "earn_rules" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "merchants_mcc_idx" ON "merchants" USING btree ("mcc");--> statement-breakpoint
CREATE UNIQUE INDEX "sub_progress_user_card_id_key" ON "sub_progress" USING btree ("user_card_id");--> statement-breakpoint
CREATE INDEX "transactions_user_card_idx" ON "transactions" USING btree ("user_card_id","occurred_at");--> statement-breakpoint
CREATE INDEX "transactions_occurred_at_idx" ON "transactions" USING btree ("occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_cards_card_id_key" ON "user_cards" USING btree ("card_id");