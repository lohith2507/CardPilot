CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");
--> statement-breakpoint
CREATE TABLE "user_currency_valuations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"currency_id" integer NOT NULL,
	"cpp" numeric(6, 3) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "user_currency_valuations_user_currency_key" ON "user_currency_valuations" USING btree ("user_id","currency_id");
--> statement-breakpoint
ALTER TABLE "user_currency_valuations" ADD CONSTRAINT "user_currency_valuations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_currency_valuations" ADD CONSTRAINT "user_currency_valuations_currency_id_point_currencies_id_fk" FOREIGN KEY ("currency_id") REFERENCES "public"."point_currencies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
DELETE FROM "transactions";
--> statement-breakpoint
DELETE FROM "sub_progress";
--> statement-breakpoint
DELETE FROM "user_cards";
--> statement-breakpoint
DROP INDEX IF EXISTS "user_cards_card_id_key";
--> statement-breakpoint
ALTER TABLE "user_cards" ADD COLUMN "user_id" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_cards" ADD CONSTRAINT "user_cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "user_cards_user_card_key" ON "user_cards" USING btree ("user_id","card_id");
--> statement-breakpoint
ALTER TABLE "point_currencies" DROP COLUMN IF EXISTS "user_cpp";
