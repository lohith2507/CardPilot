ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "household_code" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "trip_mode" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "trip_abroad_default" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_cards" ADD COLUMN IF NOT EXISTS "statement_day" integer;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_merchant_favorites" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"merchant_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_merchant_favorites" DROP CONSTRAINT IF EXISTS "user_merchant_favorites_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "user_merchant_favorites" ADD CONSTRAINT "user_merchant_favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_merchant_favorites" DROP CONSTRAINT IF EXISTS "user_merchant_favorites_merchant_id_merchants_id_fk";
--> statement-breakpoint
ALTER TABLE "user_merchant_favorites" ADD CONSTRAINT "user_merchant_favorites_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_merchant_favorites_user_merchant_key" ON "user_merchant_favorites" USING btree ("user_id","merchant_id");
