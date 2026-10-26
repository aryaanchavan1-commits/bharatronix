import {
  pgTable,
  serial,
  text,
  integer,
  real,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  tagline: text("tagline").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  price: integer("price").notNull(), // INR per year
  oldPrice: integer("old_price"),
  image: text("image").notNull(),
  rating: real("rating").notNull().default(4.8),
  reviews: integer("reviews").notNull().default(0),
  badge: text("badge"),
  deployment: text("deployment").notNull().default("Cloud + On-Premise"),
  usersIncluded: text("users_included").notNull().default("10 users"),
  features: jsonb("features").$type<string[]>().notNull().default([]),
  modules: jsonb("modules").$type<string[]>().notNull().default([]),
});

export type Product = typeof products.$inferSelect;

export type OrderItem = {
  slug: string;
  name: string;
  price: number;
  qty: number;
  image: string;
  licenseKey: string;
};

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull().unique(),
  customerName: text("customer_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  company: text("company"),
  gstin: text("gstin"),
  items: jsonb("items").$type<OrderItem[]>().notNull(),
  subtotal: integer("subtotal").notNull(),
  gst: integer("gst").notNull(),
  total: integer("total").notNull(),
  status: text("status").notNull().default("confirmed"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Order = typeof orders.$inferSelect;