# Level 2: Backend Development (API + Database)

**Duration:** 6 hours  
**Goal:** Understand how data is managed and APIs are built

---

## 📚 Table of Contents

1. [Prisma ORM](#1-prisma-orm)
2. [PostgreSQL Database](#2-postgresql-database)
3. [API Design](#3-api-design)
4. [Form Validation with Zod](#4-form-validation-with-zod)
5. [Testing with Jest](#5-testing-with-jest)
6. [Hands-On Exercises](#6-hands-on-exercises)
7. [The Full-Stack Pipeline](#7-the-full-stack-pipeline)
8. [What You've Learned](#8-what-youve-learned)

---

## 1. Prisma ORM

### What is Prisma?

Prisma is a next-generation ORM (Object-Relational Mapping) that makes database access easy with a type-safe API. It:

- Generates TypeScript types from your database schema
- Provides a clean, intuitive API
- Handles database migrations
- Works with PostgreSQL, MySQL, SQLite, and more



### Prisma Schema Definition

The `schema.prisma` file defines your database models:

```prisma
// task-manager/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  password  String?
  image     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relations
  tasks        Task[]
  attachments  Attachment[]
  notifications Notification[]
  boards       Board[]
  teamMembers  Member[]
  assigneeTasks Task[] @relation("TaskAssignee")
}

model Task {
  id          String       @id @default(cuid())
  title       String
  description String?
  status      TaskStatus   @default(TODO)
  priority    TaskPriority @default(MEDIUM)
  dueDate     DateTime?
  userId      String
  user        User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  // Relations (added in Stage 2)
  attachments      Attachment[]
  boardId          String?
  board            Board?         @relation(fields: [boardId], references: [id], onDelete: SetNull)
  assigneeId       String?
  assignee         User?          @relation("TaskAssignee", fields: [assigneeId], references: [id], onDelete: SetNull)
  recurringTaskId  String?
  recurringTask    RecurringTask? @relation(fields: [recurringTaskId], references: [id], onDelete: SetNull)
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
  @@index([status])
  @@index([createdAt])
  @@index([dueDate])
  @@index([boardId])
  @@index([assigneeId])
}

enum TaskStatus {
  TODO
  IN_PROGRESS
  COMPLETED
}

enum TaskPriority {
  LOW
  MEDIUM
  HIGH
}
```

**Key concepts:**

- `@id`: Primary key field
- `@default(cuid())`: Auto-generate unique ID (cuid = collision-resistant unique identifier)
- `String?`: Optional field (question mark makes it nullable)
- `@relation`: Defines relationships between models
- `onDelete: Cascade`: Delete child records when parent is deleted
- `onDelete: SetNull`: Set FK to null when referenced record is deleted
- `@@index`: Database index for query optimization
- `enum`: Defines a set of valid values



### Prisma Client Initialization

```tsx
// task-manager/src/lib/prisma.ts:8-15
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

**Why this pattern?**

- Creates a **global singleton** to avoid multiple instances in development (hot-reload creates new instances)
- Uses **PrismaPg adapter** for better performance with PostgreSQL
- Only reuses instance in development, creates fresh instance in production



### Querying Data



#### Find Many Records

```tsx
// task-manager/src/app/(dashboard)/dashboard/page.tsx:13-17
const tasks = await prisma.task.findMany({
  where: { userId: session.user.id },  // Filter by user
  orderBy: { createdAt: "desc" },      // Sort by creation date
  include: { 
    board: { 
      select: { id: true, name: true, color: true } 
    } 
  },
});
```

**Parameters:**

- `where`: Filter conditions
- `orderBy`: Sort order
- `include`: Include related data (like SQL JOIN)
- `select`: Choose specific fields (instead of `include`)



#### Find Unique Record

```tsx
// task-manager/src/app/api/tasks/[id]/route.ts:21-23
const task = await prisma.task.findUnique({
  where: { id, userId: session.user.id },
});
```



### Creating Data

```tsx
// task-manager/src/app/api/tasks/route.ts:60-70
const task = await prisma.task.create({
  data: {
    title,
    description,
    status: status || "TODO",
    priority: priority || "MEDIUM",
    dueDate: dueDate ? new Date(dueDate) : null,
    userId: session.user.id,
    boardId: boardId || null,
  },
});
```



### Updating Data

```tsx
// task-manager/src/app/api/tasks/[id]/route.ts:73-79
const task = await prisma.task.update({
  where: { id },
  data: {
    ...rest,
    ...(dueDate === null ? { dueDate: null } : dueDate ? { dueDate: new Date(dueDate) } : {}),
  },
});
```

**Conditional update pattern:**

```tsx
// If dueDate is explicitly null → set to null
// If dueDate has a value → convert to Date object
// If dueDate is undefined → don't change
```



### Deleting Data

```tsx
// task-manager/src/app/api/tasks/[id]/route.ts:131
await prisma.task.delete({ where: { id } });
```



### Type Safety

Prisma generates TypeScript types automatically:

```tsx
// inferred types from Prisma schema
const task: Task = await prisma.task.findUnique(...);
// task.title is known to be string
// task.dueDate is known to be DateTime | null
// task.status is known to be TaskStatus
```

**Autocomplete works:**

```tsx
prisma.task.findMany({
  where: {
    // TypeScript knows valid fields
    userId: "...",  // ✅ Valid
    status: "...",  // ✅ Valid
    invalidField: "...",  // ❌ TypeScript error
  },
});
```

---



## 2. PostgreSQL Database



### What is PostgreSQL?

PostgreSQL is a powerful, open-source object-relational database system. It's known for:

- Reliability and data integrity
- Advanced features (JSON, arrays, etc.)
- Excellent performance
- Strong community support



### Tables

Your database has these main tables:


| Table          | Purpose              | Key Fields                                   |
| -------------- | -------------------- | -------------------------------------------- |
| `User`         | User accounts        | id, email, password, name                    |
| `Task`         | Task records         | id, title, status, priority, userId, boardId |
| `Board`        | Kanban boards        | id, name, color, teamId                      |
| `Team`         | Team/collaboration   | id, name, slug, ownerId                      |
| `Member`       | Team membership      | id, teamId, userId, role                     |
| `Notification` | In-app notifications | id, userId, type, message, taskId            |
| `Attachment`   | File attachments     | id, taskId, filename, storageKey             |




### Foreign Keys

Foreign keys maintain data integrity by ensuring relationships:

```prisma
model Task {
  userId  String
  user    User  @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model User {
  id    String @id
  tasks Task[]
}
```

**What this means:**

- Every task MUST have a valid `userId` (user must exist)
- When a user is deleted (`onDelete: Cascade`), all their tasks are deleted too
- This prevents orphaned records



### Indexes

Indexes optimize query performance:

```prisma
model Task {
  @@index([userId])
  @@index([status])
  @@index([createdAt])
  @@index([dueDate])
}
```

**Why indexes matter:**

```sql
-- Without index on userId: scans entire table
SELECT * FROM tasks WHERE userId = 'abc123';  -- Slow with many rows

-- With index on userId: looks up directly
SELECT * FROM tasks WHERE userId = 'abc123';  -- Fast!
```

**Trade-off:**

- ✅ Faster SELECT queries
- ❌ Slower INSERT/UPDATE/DELETE (index must be updated too)
- ❌ More storage space



### Relationships



#### One-to-Many

```prisma
model User {
  id    String @id
  tasks Task[]
}

model Task {
  id     String @id
  userId String
  user   User   @relation(fields: [userId], references: [id])
}
```

One user has many tasks. One task belongs to one user.

#### Many-to-Many

```prisma
model User {
  id           String   @id
  teamMembers  Member[]
}

model Team {
  id      String   @id
  members Member[]
}

model Member {
  id      String  @id
  userId  String
  user    User    @relation(fields: [userId], references: [id])
  teamId  String
  team    Team    @relation(fields: [teamId], references: [id])
  role    MemberRole
}
```

Users can be in multiple teams. Teams can have multiple users. The `Member` table is the "join table".

---



## 3. API Design



### RESTful API Design

Your API follows REST (Representational State Transfer) principles:


| HTTP Method | Endpoint          | Purpose         | Example                    |
| ----------- | ----------------- | --------------- | -------------------------- |
| GET         | `/api/tasks`      | List all tasks  | `GET /api/tasks`           |
| POST        | `/api/tasks`      | Create new task | `POST /api/tasks`          |
| GET         | `/api/tasks/[id]` | Get single task | `GET /api/tasks/abc123`    |
| PUT         | `/api/tasks/[id]` | Update task     | `PUT /api/tasks/abc123`    |
| DELETE      | `/api/tasks/[id]` | Delete task     | `DELETE /api/tasks/abc123` |




### API Route Handlers

Next.js App Router uses file-based API routes:

```tsx
// task-manager/src/app/api/tasks/route.ts

// GET /api/tasks
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tasks = await prisma.task.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      include: { board: { select: { id: true, name: true, color: true } } },
    });

    trackTaskOperation("list", "success");
    observeRequest("GET", "/api/tasks", 200, (Date.now() - start) / 1000);
    return NextResponse.json(tasks);
  } catch {
    trackTaskOperation("list", "error");
    observeRequest("GET", "/api/tasks", 500, (Date.now() - start) / 1000);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/tasks
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = taskCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { title, description, status, priority, dueDate, boardId } = parsed.data;

    const task = await prisma.task.create({
      data: {
        title,
        description,
        status: status || "TODO",
        priority: priority || "MEDIUM",
        dueDate: dueDate ? new Date(dueDate) : null,
        userId: session.user.id,
        boardId: boardId || null,
      },
    });

    trackTaskOperation("create", "success");
    logger.info({ taskId: task.id, userId: session.user.id }, "Task created");
    observeRequest("POST", "/api/tasks", 201, (Date.now() - start) / 1000);
    emitToRealtime("task:created", task);
    triggerWebhook("task.created", task, session.user.id);
    return NextResponse.json(task, { status: 201 });
  } catch {
    trackTaskOperation("create", "error");
    logger.error({ err }, "Failed to create task");
    observeRequest("POST", "/api/tasks", 500, (Date.now() - start) / 1000);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

**Key patterns:**

- Export named functions (`GET`, `POST`, `PUT`, `DELETE`) for HTTP methods
- Use `NextResponse.json()` to return JSON responses
- Always handle errors and return appropriate status codes
- Track metrics and logs
- Fire-and-forget: realtime + webhook delivery



### Request Validation

```tsx
// task-manager/src/app/api/tasks/route.ts:47-56
const body = await req.json();
const parsed = taskCreateSchema.safeParse(body);

if (!parsed.success) {
  return NextResponse.json(
    { error: "Validation failed", details: parsed.error.issues },
    { status: 400 }
  );
}

const { title, description, status, priority, dueDate, boardId } = parsed.data;
```



### Error Handling

```tsx
// task-manager/src/app/api/tasks/[id]/route.ts:38-107
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const start = Date.now();
  try {
    const session = await auth();
    if (!session?.user?.id) {
      observeRequest("PUT", "/api/tasks/:id", 401, (Date.now() - start) / 1000);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const parsed = taskUpdateSchema.safeParse(body);

    if (!parsed.success) {
      observeRequest("PUT", "/api/tasks/:id", 400, (Date.now() - start) / 1000);
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const existing = await prisma.task.findUnique({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      observeRequest("PUT", "/api/tasks/:id", 404, (Date.now() - start) / 1000);
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const { dueDate, ...rest } = parsed.data;

    const task = await prisma.task.update({
      where: { id },
      data: {
        ...rest,
        ...(dueDate === null ? { dueDate: null } : dueDate ? { dueDate: new Date(dueDate) } : {}),
      },
    });

    if (existing.status !== "COMPLETED" && task.status === "COMPLETED") {
      await prisma.notification.create({
        data: {
          userId: session.user.id,
          type: "task.completed",
          message: `You completed "${task.title}". Nice work!`,
          taskId: task.id,
        },
      });
    }

    trackTaskOperation("update", "success");
    logger.info({ taskId: id, userId: session.user.id }, "Task updated");
    observeRequest("PUT", "/api/tasks/:id", 200, (Date.now() - start) / 1000);
    emitToRealtime("task:updated", task);
    triggerWebhook("task.updated", task, session.user.id);
    return NextResponse.json(task);
  } catch (err) {
    trackTaskOperation("update", "error");
    logger.error({ err, taskId: req.url }, "Failed to update task");
    observeRequest("PUT", "/api/tasks/:id", 500, (Date.now() - start) / 1000);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

**Error handling best practices:**

- Always return appropriate HTTP status codes (200, 400, 401, 404, 500)
- Log errors with context (request URL, task ID, user ID)
- Track metrics for monitoring
- Return user-friendly error messages



### HTTP Status Codes


| Status Code | Meaning               | Example Usage                 |
| ----------- | --------------------- | ----------------------------- |
| 200         | OK                    | GET request successful        |
| 201         | Created               | POST created new resource     |
| 400         | Bad Request           | Validation failed             |
| 401         | Unauthorized          | Not logged in / invalid token |
| 404         | Not Found             | Resource doesn't exist        |
| 500         | Internal Server Error | Server error (database, etc.) |


---



## 4. Form Validation with Zod



### What is Zod?

Zod is a TypeScript-first schema validation library. It:

- Validates input data
- Generates TypeScript types automatically
- Provides clear error messages
- Works on both client and server



### Defining Schemas

```tsx
// task-manager/src/lib/validations.ts

export const loginSchema = z.object({
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
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "COMPLETED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  dueDate: z.string().nullable().optional(),
  boardId: z.string().nullable().optional(),
});
```

**Validation rules:**

- `z.string()`: Must be a string
- `.email()`: Must be a valid email format
- `.min(6)`: Minimum length of 6
- `.max(200)`: Maximum length of 200
- `.optional()`: Field is not required
- `.nullable()`: Field can be null (explicitly)
- `.enum([...])`: Must be one of the specified values
- Custom error messages in quotes



### Validating Input

```tsx
// task-manager/src/app/api/tasks/route.ts:47-58
const body = await req.json();
const parsed = taskCreateSchema.safeParse(body);

if (!parsed.success) {
  return NextResponse.json(
    { error: "Validation failed", details: parsed.error.issues },
    { status: 400 }
  );
}

const { title, description, status, priority, dueDate, boardId } = parsed.data;
```

`safeParse()` **returns:**

```tsx
// On success
{
  success: true,
  data: {
    title: "Buy groceries",
    description: "Milk, eggs, bread",
    priority: "HIGH",
    // ...
  }
}

// On failure
{
  success: false,
  error: {
    issues: [
      {
        code: "too_small",
        message: "Title is required",
        path: ["title"]
      }
    ]
  }
}
```



### Type Inference

Zod can automatically generate TypeScript types:

```tsx
// task-manager/src/lib/validations.ts:30-33
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;
```

`z.infer<Schema>` automatically creates a TypeScript type matching the schema.

**Benefits:**

- Single source of truth for validation and types
- Changes to schema automatically update types
- No manual type maintenance



### Client-Side Validation

```tsx
// task-manager/src/components/AuthForm.tsx (example)
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { loginSchema } from "@/lib/validations";

export default function AuthForm() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input
        {...register("email")}
        placeholder="Email"
      />
      {errors.email && <p className="text-red-500">{errors.email.message}</p>}
      
      <input
        {...register("password")}
        type="password"
        placeholder="Password"
      />
      {errors.password && <p className="text-red-500">{errors.password.message}</p>}
      
      <button type="submit">Login</button>
    </form>
  );
}
```

---



## 5. Testing with Jest



### What is Jest?

Jest is a JavaScript testing framework. React Testing Library helps you test React components.

### Test Configuration

```tsx
// task-manager/jest.config.ts:8-14
const config: Config = {
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testEnvironment: "jsdom",  // Browser-like environment
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",  // Handle path aliases
  },
  testPathIgnorePatterns: ["<rootDir>/node_modules/", "<rootDir>/.next/"],
};
```



### Test Setup

```tsx
// task-manager/jest.setup.ts:1
import "@testing-library/jest-dom";
```

This adds custom matchers like `.toBeInTheDocument()`.

### Component Testing Example

```tsx
// task-manager/src/components/__tests__/TaskCard.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import TaskCard from "../TaskCard";

const mockTask = {
  id: "1",
  title: "Test Task",
  description: "A test description",
  status: "TODO",
  priority: "HIGH",
  dueDate: "2025-12-31",
  createdAt: "2025-01-01T00:00:00.000Z",
};

const mockHandlers = {
  onStatusChange: jest.fn().mockResolvedValue(undefined),
  onDelete: jest.fn().mockResolvedValue(undefined),
};

describe("TaskCard", () => {
  it("renders task title and description", () => {
    render(<TaskCard task={mockTask} {...mockHandlers} />);
    expect(screen.getByText("Test Task")).toBeInTheDocument();
    expect(screen.getByText("A test description")).toBeInTheDocument();
  });

  it("displays priority badge", () => {
    render(<TaskCard task={mockTask} {...mockHandlers} />);
    expect(screen.getByText("HIGH")).toBeInTheDocument();
  });

  it("shows status select with current value", () => {
    render(<TaskCard task={mockTask} {...mockHandlers} />);
    const select = screen.getByRole("combobox");
    expect(select).toHaveValue("TODO");
  });

  it("renders delete button hidden by default", () => {
    render(<TaskCard task={mockTask} {...mockHandlers} />);
    const deleteBtn = screen.getByTitle("Delete task");
    expect(deleteBtn).toHaveClass("opacity-0");
  });

  it("shows overdue indicator for past due tasks", () => {
    const overdueTask = {
      ...mockTask,
      dueDate: "2020-01-01",
    };
    render(<TaskCard task={overdueTask} {...mockHandlers} />);
    expect(screen.getByText(/Overdue/)).toBeInTheDocument();
  });

  it("calls onStatusChange when status is changed", async () => {
    render(<TaskCard task={mockTask} {...mockHandlers} />);
    const select = screen.getByRole("combobox");
    
    fireEvent.change(select, { target: { value: "IN_PROGRESS" } });
    
    expect(mockHandlers.onStatusChange).toHaveBeenCalledWith("1", "IN_PROGRESS");
  });

  it("calls onDelete when delete button is clicked", async () => {
    window.confirm = jest.fn(() => true);  // Mock confirmation dialog
    render(<TaskCard task={mockTask} {...mockHandlers} />);
    
    const deleteBtn = screen.getByTitle("Delete task");
    fireEvent.click(deleteBtn);
    
    expect(mockHandlers.onDelete).toHaveBeenCalledWith("1");
  });
});
```

**Testing patterns:**

- `render(<Component />)`: Renders component in test environment
- `screen.getByText()`: Finds element by text content
- `screen.getByRole()`: Finds element by ARIA role (combobox, button, etc.)
- `screen.getByTitle()`: Finds element by title attribute
- `expect(...).toBeInTheDocument()`: Assertion
- `expect(...).toHaveValue()`: Check input value
- `expect(...).toHaveClass()`: Check CSS class
- `fireEvent.change()`: Simulate input change
- `fireEvent.click()`: Simulate click



### Mocking Async Handlers

```tsx
// task-manager/src/components/__tests__/TaskCard.test.tsx:14-17
const mockHandlers = {
  onStatusChange: jest.fn().mockResolvedValue(undefined),
  onDelete: jest.fn().mockResolvedValue(undefined),
};
```

`.mockResolvedValue(undefined)` makes async handlers resolve immediately in tests.

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm test -- --coverage

# Run specific test file
npm test TaskCard.test.tsx
```

---



## 6. Hands-On Exercises



### Exercise 1: Explore the Database

```bash
cd task-manager
npm run db:studio
```

This opens Prisma Studio, a visual database explorer. Try:

- Creating a new task
- Viewing the Task table
- Editing task details
- Deleting a task
- Exploring relationships



### Exercise 2: Add a New API Endpoint

Create `task-manager/src/app/api/hello/route.ts`:

```tsx
// task-manager/src/app/api/hello/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  
  return NextResponse.json({
    message: "Hello from the API!",
    user: session?.user || null,
    timestamp: new Date().toISOString(),
  });
}
```

Test it with curl or Postman:

```bash
curl http://localhost:3000/api/hello
```



### Exercise 3: Create a New Database Model

Add a `Comment` model to `task-manager/prisma/schema.prisma`:

```prisma
model Comment {
  id        String   @id @default(cuid())
  content   String
  taskId    String
  task      Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())

  @@index([taskId])
  @@index([userId])
}
```

Update the `Task` model:

```prisma
model Task {
  // ... existing fields
  comments Comment[]
}
```

Update the `User` model:

```prisma
model User {
  // ... existing fields
  comments Comment[]
}
```

Run migration:

```bash
npm run db:push
```

Create a CRUD API for comments:

```tsx
// task-manager/src/app/api/tasks/[id]/comments/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const comments = await prisma.comment.findMany({
    where: { taskId: id },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(comments);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  const comment = await prisma.comment.create({
    data: {
      content: body.content,
      taskId: id,
      userId: session.user.id,
    },
  });

  return NextResponse.json(comment, { status: 201 });
}
```



### Exercise 4: Write a Test

Create a test for a simple component:

```tsx
// task-manager/src/components/__tests__/Greeting.test.tsx
import { render, screen } from "@testing-library/react";
import Greeting from "../Greeting";

describe("Greeting", () => {
  it("renders the greeting message", () => {
    render(<Greeting name="John" />);
    expect(screen.getByText("Welcome, John! 👋")).toBeInTheDocument();
  });

  it("uses default name when not provided", () => {
    render(<Greeting name={null} />);
    expect(screen.getByText("Welcome, User! 👋")).toBeInTheDocument();
  });
});
```

Run the test:

```bash
npm test Greeting.test.tsx
```

---



## 7. The Full-Stack Pipeline

> **This is the capstone section.** It ties together everything from Level 1 (frontend) and Level 2 (backend) into one unified picture. Read this carefully — it's the mental model you need before Level 3 (Docker) and Level 4+ (Kubernetes & Microservices).



### The Big Picture

Every action in this app flows through the same layers. Here's the complete stack:

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER'S BROWSER                           │
│                                                                 │
│  React Components (Level 1)                                     │
│  ├── TaskForm.tsx     ← Controlled inputs, useState             │
│  ├── TaskList.tsx     ← Kanban board, fetch(), Socket.io        │
│  └── TaskCard.tsx     ← Individual task display                 │
│                                                                 │
│  ──────────────── fetch() / WebSocket ────────────────          │
│                          (HTTP request)                         │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    NEXT.JS SERVER (Node.js)                     │
│                                                                 │
│  Layer 1: Routing                                               │
│  ├── /dashboard/page.tsx     ← Server Component (initial load)  │
│  └── /api/tasks/route.ts     ← API Route (mutations)            │
│                                                                 │
│  Layer 2: Authentication                                        │
│  └── auth() → NextAuth → reads JWT cookie → returns session     │
│                                                                 │
│  Layer 3: Validation                                            │
│  └── Zod safeParse() → checks title, priority, dueDate, etc.    │
│                                                                 │
│  Layer 4: Database (Prisma)                                     │
│  └── prisma.task.create() → generates SQL → sends to DB         │
│                                                                 │
│  Layer 5: Side Effects                                          │
│  ├── emitToRealtime()   → POST to realtime-service              │
│  ├── triggerWebhook()   → POST to webhook-service               │
│  ├── logger.info()      → structured JSON log                   │
│  └── trackTaskOperation()→ Prometheus metrics                   │
│                                                                 │
│  ──────────────────── SQL query ──────────────────────          │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    POSTGRESQL DATABASE                          │
│                                                                 │
│  Tables: User, Task, Board, Team, Member, Notification...       │
│  Indexes: userId, status, createdAt, dueDate                    │
│  Constraints: Foreign keys, unique, not null                    │
│                                                                 │
│  ─────────── returns rows as JSON objects ───────────           │
└─────────────────────────────────────────────────────────────────┘
```

---



### Pipeline 1: Initial Page Load (Server Component)

When you navigate to `/dashboard`, this is what happens — **all on the server**, before any JavaScript runs in the browser:

```
Step 1  ──  Browser sends GET /dashboard
             │
Step 2  ──  Next.js router matches → dashboard/page.tsx (Server Component)
             │
Step 3  ──  auth() reads JWT cookie → verifies signature → extracts userId
             │         (if no valid session → redirect("/login"))
             │
Step 4  ──  Promise.all([                              ← Parallel queries!
             │     prisma.task.findMany({ where: { userId } }),
             │     prisma.board.findMany({ ... }),
             │     prisma.user.findUnique({ ... })     ← welcomeShown check
             │  ])
             │
Step 5  ──  Prisma translates each call to SQL:
             │     SELECT * FROM "Task" WHERE userId = '...' ORDER BY ...
             │     SELECT * FROM "Board" WHERE teamId IN (SELECT ...)
             │     SELECT welcomeShown FROM "User" WHERE id = '...'
             │
Step 6  ──  PostgreSQL executes queries, returns rows
             │
Step 7  ──  Prisma maps rows → typed TypeScript objects
             │     task.title is string ✅ (not unknown)
             │     task.dueDate is Date | null ✅
             │
Step 8  ──  Dates serialized to ISO strings (Date → string for client)
             │     task.dueDate.toISOString()
             │
Step 9  ──  Server renders HTML with data:
             │     <TaskList initialTasks={serializedTasks} />
             │     <Greeting name={session.user.name} />
             │     (Greeting only if welcomeShown === false)
             │
Step 10 ──  HTML + serialized props sent to browser as response
             │
Step 11 ──  Browser renders HTML instantly (no loading spinner!)
             │
Step 12 ──  React "hydrates" — client components become interactive
                  TaskList can now respond to clicks, drags, etc.
```

**Key insight:** The initial page load gives you pre-rendered HTML with real data. The user sees their tasks **before** any client-side JavaScript runs. This is the power of Server Components.

**Where each Level applies:**


| Step  | Concept                                | From    |
| ----- | -------------------------------------- | ------- |
| 2     | File-based routing, Server Components  | Level 1 |
| 3     | NextAuth, JWT sessions                 | Level 2 |
| 4-7   | Prisma ORM, SQL queries                | Level 2 |
| 8     | Serialization (Date → string boundary) | Both    |
| 9     | Server → Client Component props        | Level 1 |
| 11-12 | Hydration, `useState`, event handlers  | Level 1 |


---



### Pipeline 2: Creating a Task (The Full Round Trip)

This is the most important pipeline to understand. It touches **every layer** of the stack:

```
┌─────────────────── BROWSER (Client) ────────────────────┐
│                                                         │
│  Step 1: User clicks "+ New Task"                       │
│  ─── onClick → setShowForm(true)                        │
│  ─── React re-renders, TaskForm appears                 │
│                                                         │
│  Step 2: User types title = "Buy groceries"             │
│          selects priority = "HIGH"                      │
│  ─── Controlled inputs update useState                  │
│  ─── <input value={title} onChange={setTitle} />        │
│                                                         │
│  Step 3: User clicks "Create Task"                      │
│  ─── TaskForm.handleSubmit(e)                           │
│  ─── e.preventDefault()     ← stops page reload         │
│  ─── setLoading(true)       ← button shows "Saving..."  │
│  ─── calls onSubmit({ title, priority, ... })           │
│                                                         │
│  Step 4: TaskList.handleCreate(data)                    │
│  ─── fetch("/api/tasks", {                              │
│        method: "POST",                                  │
│        headers: { "Content-Type": "application/json" }, │
│        body: JSON.stringify(data)                       │
│      })                                                 │
│  ─── Browser sends HTTP POST with JSON body             │
│  │                                                      │
│  │   Cookie: next-auth.session-token=eyJhbGci...        │
│  │   Body: { "title": "Buy groceries",                  │
│  │           "priority": "HIGH" }                       │
│  │                                                      │
└─────┼───────────────────────────────────────────────────┘
      │
      ▼
┌─────────────── NEXT.JS API ROUTE (Server) ──────────────┐
│                                                         │
│  Step 5: Route matched → POST handler runs              │
│  ─── src/app/api/tasks/route.ts → POST(req)             │
│                                                         │
│  Step 6: Authentication                                 │
│  ─── const session = await auth()                       │
│  ─── NextAuth decrypts JWT from cookie                  │
│  ─── Extracts: { user: { id: "clx...", name: "John" } } │
│  ─── No session? → return 401 Unauthorized              │
│                                                         │
│  Step 7: Parse & Validate (Zod)                         │
│  ─── const body = await req.json()                      │
│  ─── taskCreateSchema.safeParse(body)                   │
│  ─── Checks: title is string, min 1, max 200            │
│  ─── Checks: priority is "LOW" | "MEDIUM" | "HIGH"      │
│  ─── Invalid? → return 400 with error details           │
│  ─── Valid? → parsed.data is fully typed                │
│                                                         │
│  Step 8: Database Write (Prisma → PostgreSQL)           │
│  ─── prisma.task.create({                               │
│        data: {                                          │
│          title: "Buy groceries",                        │
│          priority: "HIGH",                              │
│          status: "TODO",                                │
│          userId: "clx...",   ← from session             │
│        }                                                │
│      })                                                 │
│  ─── Prisma generates SQL:                              │
│  │     INSERT INTO "Task" (id, title, priority, ...)    │
│  │     VALUES ($1, $2, $3, ...)                         │
│  │     RETURNING *                                      │
│  ─── PostgreSQL executes INSERT                         │
│  ─── Returns new row with generated id + timestamps     │
│  ─── Prisma maps to typed object: { id, title, ... }    │
│                                                         │
│  Step 9: Side Effects (fire-and-forget)                 │
│  ─── emitToRealtime("task:created", task)               │
│  │     → POST to realtime-service:3001/emit             │
│  │     → Other connected browsers get WebSocket event   │
│  │                                                      │
│  ─── triggerWebhook("task.created", task, userId)       │
│  │     → POST to webhook-service:3003/trigger           │
│  │     → Queues HTTP delivery to registered URLs        │
│  │                                                      │
│  ─── logger.info({ taskId, userId }, "Task created")    │
│  │     → Structured JSON log to stdout                  │
│  │                                                      │
│  ─── trackTaskOperation("create", "success")            │
│        → Increments Prometheus counter                  │
│                                                         │
│  Step 10: Send Response                                 │
│  ─── NextResponse.json(task, { status: 201 })           │
│  ─── HTTP 201 Created                                   │
│  ─── Body: { id: "clx...", title: "Buy groceries", ... }│
│  │                                                      │
└─────┼───────────────────────────────────────────────────┘
      │
      ▼
┌─────────────── BACK IN THE BROWSER ─────────────────────┐
│                                                         │
│  Step 11: fetch() resolves                              │
│  ─── const res = await fetch(...)  ← response received  │
│  ─── res.ok === true (status 201)                       │
│                                                         │
│  Step 12: UI Update                                     │
│  ─── setShowForm(false)         ← hide the form         │
│  ─── await refreshTasks()       ← re-fetch all tasks    │
│  │     → fetch("/api/tasks")    ← GET request           │
│  │     → setTasks(data)         ← React re-renders      │
│  │                                                      │
│  Step 13: New task appears in Kanban board              │
│  ─── TaskList re-renders with updated tasks array       │
│  ─── "Buy groceries" card appears in "To Do" column     │
│  ─── User sees the result of their action               │
│                                                         │
│  Step 14: Real-time propagation (if WebSocket connected)│
│  ─── Other users' browsers receive "task:created" event │
│  ─── Their TaskList calls refreshTasks() too            │
│  ─── Everyone's board updates live                      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---



### The Code Trail: Every File Touched

Here's every file involved in creating a single task, in order:


| #   | File                                  | Role                                      | Level |
| --- | ------------------------------------- | ----------------------------------------- | ----- |
| 1   | `src/components/TaskForm.tsx`         | Controlled form inputs, `useState`        | L1    |
| 2   | `src/components/TaskList.tsx:137-157` | `handleCreate()` → `fetch()` call         | L1→L2 |
| 3   | `src/app/api/tasks/route.ts:38-87`    | `POST()` handler — auth, validate, create | L2    |
| 4   | `src/lib/auth.ts:8-58`                | NextAuth config, JWT decryption           | L2    |
| 5   | `src/lib/validations.ts:14-21`        | `taskCreateSchema` Zod definition         | L2    |
| 6   | `src/lib/prisma.ts`                   | Prisma client singleton                   | L2    |
| 7   | `prisma/schema.prisma:103-129`        | `Task` model definition                   | L2    |
| 8   | `src/lib/realtime.ts:3-19`            | `emitToRealtime()` fire-and-forget        | L2    |
| 9   | `src/lib/webhook.ts:3-19`             | `triggerWebhook()` fire-and-forget        | L2    |
| 10  | `src/lib/metrics.ts`                  | Prometheus metrics tracking               | L2    |
| 11  | `src/lib/logger.ts`                   | Pino structured logging                   | L2    |
| 12  | PostgreSQL                            | Actual data storage                       | L2    |


**12 files. One click.** This is what "full-stack" means.

---



### Server vs Client: Who Does What?

This table clarifies the boundary between Level 1 (client) and Level 2 (server):


| Responsibility           | Where            | Level  | Technology                   |
| ------------------------ | ---------------- | ------ | ---------------------------- |
| Display UI               | Browser          | L1     | React, Tailwind CSS          |
| Handle clicks/typing     | Browser          | L1     | `useState`, event handlers   |
| Form validation (UX)     | Browser          | L1     | HTML `required`, `maxLength` |
| Send HTTP requests       | Browser → Server | Bridge | `fetch()`                    |
| Authenticate user        | Server           | L2     | NextAuth, JWT, bcrypt        |
| Validate data (security) | Server           | L2     | Zod `safeParse()`            |
| Query/mutate database    | Server           | L2     | Prisma ORM                   |
| Store data               | Server           | L2     | PostgreSQL                   |
| Push real-time events    | Server → Server  | L2     | Internal HTTP calls          |
| Log & track metrics      | Server           | L2     | Pino, prom-client            |
| Return JSON response     | Server → Browser | Bridge | `NextResponse.json()`        |
| Update UI with result    | Browser          | L1     | `setState`, re-render        |


**Critical rule:** Never trust client-side validation alone. The Zod validation in Step 7 is the **security boundary** — even if someone bypasses the browser, the server rejects bad data.

---



### Request/Response Data Transformation

Data changes shape as it moves through the pipeline. Here's the same task at each stage:

```
Browser (user types):
  { title: "Buy groceries", priority: "HIGH" }

fetch() body (JSON string):
  '{"title":"Buy groceries","priority":"HIGH"}'

API route (parsed object):
  { title: "Buy groceries", priority: "HIGH" }     ← typeof body

After Zod (validated + typed):
  { title: "Buy groceries", priority: "HIGH" }     ← now type-safe

Prisma create (SQL parameters):
  INSERT INTO "Task" VALUES (
    $1 = 'clxyz123',           ← auto-generated cuid
    $2 = 'Buy groceries',      ← title
    $3 = 'TODO',               ← status (default)
    $4 = 'HIGH',               ← priority
    $5 = NULL,                 ← dueDate
    $6 = 'clxuser456',         ← userId (from session)
    $7 = '2026-07-09T...',     ← createdAt (auto)
    $8 = '2026-07-09T...'      ← updatedAt (auto)
  )

Database response (row):
  { id: "clxyz123", title: "Buy groceries", status: "TODO", ... }

API response (JSON):
  { "id":"clxyz123", "title":"Buy groceries", "status":"TODO", ... }

Browser (after fetch):
  { id: "clxyz123", title: "Buy groceries", status: "TODO", ... }

React state (in TaskList):
  tasks: [{ id: "clxyz123", title: "Buy groceries", ... }]

Rendered HTML:
  <div class="rounded-md ...">
    <h3>Buy groceries</h3>
    <span class="bg-red-100">HIGH</span>
  </div>
```

---



### Why This Matters for What's Next

The pipeline above runs inside a **single Next.js process** on a **single server**. Here's what changes as we scale:

```
RIGHT NOW (Levels 1-2):              WHAT'S COMING (Levels 3-6):

┌─────────────────┐                  ┌──────────┐  ┌──────────────┐
│  Next.js App    │                  │  Next.js │  │  Scheduler   │
│  (one process)  │                  │   App    │  │  (CronJob)   │
│                 │                  └────┬─────┘  └──────────────┘
│  ├── Frontend   │     becomes      ┌────┴─────┐  ┌──────────────┐
│  ├── API        │  ──────────→     │ NGINX    │  │ Notification │
│  ├── Auth       │                  │ Ingress  │  │   Service    │
│  └── DB queries │                  └────┬─────┘  └──────────────┘
│                 │                       │        ┌──────────────┐
└────────┬────────┘              ┌────────┴────────┤  File Service│
         │                       │  Kubernetes     ├──────────────┤
┌────────▼────────┐              │  Cluster        │  Search Sync │
│   PostgreSQL    │              │                 ├──────────────┤
│   (Supabase)    │              │                 │  Realtime    │
└─────────────────┘              │                 ├──────────────┤
                                 │                 │  Webhook     │
                                 │                 ├──────────────┤
                                 │                 │  Analytics   │
                                 │                 ├──────────────┤
                                 │                 │  Team Service│
                                 └────────┬────────┴──────────────┘
                                          │
                                 ┌────────▼────────┐
                                 │   PostgreSQL    │
                                 │   (Supabase)    │
                                 └─────────────────┘
```

**What stays the same:**

- Each microservice still has the same layers (routing → auth → validation → database)
- The `fetch()` pattern you learned is how services talk to each other
- PostgreSQL and Prisma work the same way in every service

**What changes:**

- Instead of one process doing everything, work is split across **8+ services**
- Services communicate over HTTP (internal ClusterIP network)
- Docker packages each service into a portable container
- Kubernetes orchestrates containers (scheduling, scaling, self-healing)
- NGINX Ingress routes external traffic to the right service

**The pipeline you just learned is the foundation.** Every microservice is a smaller version of this same pattern. When you understand how a task goes from browser → API → database → response, you understand 80% of the architecture.

---



### Quick Self-Check

Can you answer these questions? If yes, you're ready for Level 3.

1. **Why does the dashboard load without a spinner?**
  Answer The Server Component fetches data before sending HTML. The browser receives pre-rendered content immediately — no client-side fetch needed for initial load.
2. **What happens if someone sends a POST without being logged in?**
  Answer Step 6 catches it. `auth()` returns no session → API returns `401 Unauthorized` → `fetch()` gets `res.ok === false` → `handleCreate()` throws → TaskForm shows error message.
3. **Why validate with Zod when the form already has HTML validation?**
  Answer HTML validation is UX-only. Anyone can bypass it (browser DevTools, curl, Postman). Zod runs on the server — it's the actual security boundary. Never trust the client.
4. **What does "fire-and-forget" mean for realtime/webhook?**
  Answer The API route calls `emitToRealtime()` and `triggerWebhook()` but doesn't `await` their results. The task is created and the response is sent immediately. If the realtime/webhook service is down, the task still succeeds — those services retry independently.
5. **Where does the userId come from in the INSERT?**
  Answer NOT from the request body (that would be insecure). It comes from `session.user.id`, extracted by NextAuth from the JWT cookie. The user can't fake their identity.

---



## 8. What You've Learned



### Technologies Mastered

✅ Database design with Prisma  
✅ RESTful API design  
✅ Error handling patterns  
✅ Input validation  
✅ Authentication and authorization  
✅ PostgreSQL database concepts  
✅ Testing with Jest and React Testing Library

### Core Concepts

✅ Prisma schema definition  
✅ Database relationships (one-to-many, many-to-many)  
✅ Database indexes for performance  
✅ Foreign keys and data integrity  
✅ API route handlers  
✅ HTTP status codes  
✅ Request validation with Zod  
✅ Type inference from Zod schemas  
✅ Component testing patterns  
✅ Mocking async handlers

### Best Practices

✅ Type-safe database queries  
✅ Protected API routes  
✅ Proper error handling  
✅ Input validation on both client and server  
✅ RESTful API design  
✅ Database indexing  
✅ Test isolation with mocks  
✅ User-friendly error messages  

---



## 📚 Next Steps

After completing Level 2, you're ready for:

**Level 3: Docker & Containerization** - 4 hours

- Docker fundamentals
- Multi-stage Docker builds
- Docker Compose
- .dockerignore
- Health checks

The pipeline you learned in [Section 7](#7-the-full-stack-pipeline) runs in a single process today. Docker packages it into a portable container that runs identically anywhere — your laptop, a cloud server, or a Kubernetes cluster.

Continue with `Level-3.md` when you're ready!

---

**Happy learning! 🚀**