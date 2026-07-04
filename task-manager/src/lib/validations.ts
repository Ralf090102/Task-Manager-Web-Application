import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const registerSchema = z.object({
  name: z.string().min(1, "Name is required").max(50),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const taskCreateSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(1000).optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "COMPLETED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  dueDate: z.string().optional(),
  boardId: z.string().nullable().optional(),
});

export const taskUpdateSchema = z.object({
  title: z.string().min(1, "Title is required").max(200).optional(),
  description: z.string().max(1000).optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "COMPLETED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  dueDate: z.string().nullable().optional(),
  boardId: z.string().nullable().optional(),
});

export const recurringTaskCreateSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(1000).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  cron: z.string().min(1, "Cron expression is required"),
});

export const recurringTaskUpdateSchema = z.object({
  title: z.string().min(1, "Title is required").max(200).optional(),
  description: z.string().max(1000).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  cron: z.string().min(1).optional(),
  active: z.boolean().optional(),
});

const webhookEvents = [
  "task.created",
  "task.updated",
  "task.deleted",
] as const;

export const webhookCreateSchema = z.object({
  url: z.string().url("Invalid URL"),
  events: z.array(z.enum(webhookEvents)).min(1, "Select at least one event"),
  active: z.boolean().optional(),
});

export const webhookUpdateSchema = z.object({
  url: z.string().url("Invalid URL").optional(),
  events: z.array(z.enum(webhookEvents)).min(1).optional(),
  active: z.boolean().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;
export type RecurringTaskCreateInput = z.infer<typeof recurringTaskCreateSchema>;
export type RecurringTaskUpdateInput = z.infer<typeof recurringTaskUpdateSchema>;
export type WebhookCreateInput = z.infer<typeof webhookCreateSchema>;
export type WebhookUpdateInput = z.infer<typeof webhookUpdateSchema>;

export const teamCreateSchema = z.object({
  name: z.string().min(1, "Team name is required").max(100),
});

export const memberInviteSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z.enum(["ADMIN", "MEMBER", "VIEWER"]).optional(),
});

export const memberRoleSchema = z.object({
  role: z.enum(["ADMIN", "MEMBER", "VIEWER"]),
});

export const boardCreateSchema = z.object({
  name: z.string().min(1, "Board name is required").max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export type TeamCreateInput = z.infer<typeof teamCreateSchema>;
export type MemberInviteInput = z.infer<typeof memberInviteSchema>;
export type MemberRoleInput = z.infer<typeof memberRoleSchema>;
export type BoardCreateInput = z.infer<typeof boardCreateSchema>;
