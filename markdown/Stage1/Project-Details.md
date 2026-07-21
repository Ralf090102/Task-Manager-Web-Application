# Phase 1 Learning Summary

This document explains the core concepts and technologies implemented in Phase 1 of the Task Manager project. Each section includes real examples from your codebase to help you understand how these concepts work in practice.

> **Note**: The codebase has evolved significantly since Phase 1 — the dashboard is now a Kanban board, tasks support board assignment and recurring task links, and multiple microservices have been added. The code snippets below are from the Phase 1 era and may differ from the current source. Concepts remain valid; consult the actual source files for the latest code.

---

## Table of Contents

1. [React Fundamentals](#react-fundamentals)
2. [JSX and Template Literals](#jsx-and-template-literals)
3. [TypeScript in React](#typescript-in-react)
4. [Component State Management](#component-state-management)
5. [Props and Component Communication](#props-and-component-communication)
6. [Client vs Server Components](#client-vs-server-components)
7. [Next.js App Router](#nextjs-app-router)
8. [API Routes](#api-routes)
9. [Authentication with NextAuth v5](#authentication-with-nextauth-v5)
10. [Database ORM with Prisma](#database-orm-with-prisma)
11. [Form Validation with Zod](#form-validation-with-zod)
12. [Testing with Jest and React Testing Library](#testing-with-jest-and-react-testing-library)
13. [Tailwind CSS v4](#tailwind-css-v4)
14. [Key Patterns and Best Practices](#key-patterns-and-best-practices)
15. [Docker Fundamentals](#docker-fundamentals)
16. [Multi-Stage Docker Builds](#multi-stage-docker-builds)
17. [.dockerignore](#dockerignore)
18. [Docker Compose](#docker-compose)
19. [Health Checks and Dependencies](#health-checks-and-dependencies)
20. [Docker Environment Variables](#docker-environment-variables)
21. [Docker Best Practices](#docker-best-practices)
22. [GitHub Actions Fundamentals](#github-actions-fundamentals)
23. [Your CI Pipeline](#your-ci-pipeline)
24. [Quality Gates Job](#quality-gates-job)
25. [Security Scanning Job](#security-scanning-job)
26. [Docker Build & Push Job](#docker-build--push-job)
27. [GitHub Secrets Configuration](#github-secrets-configuration)
28. [CI/CD Best Practices](#cicd-best-practices)
29. [Kubernetes Fundamentals](#kubernetes-fundamentals)
30. [Helm Chart Development](#helm-chart-development)
31. [Minikube for Local Development](#minikube-for-local-development)
32. [Deploying with Helm](#deploying-with-helm)
33. [Health Checks and Probes](#health-checks-and-probes)
34. [Resource Limits](#resource-limits)
35. [Kubernetes Networking Flow](#kubernetes-networking-flow)
36. [Troubleshooting Kubernetes Deployment](#troubleshooting-kubernetes-deployment)
37. [What is Observability?](#what-is-observability)
38. [Prometheus Metrics Collection](#prometheus-metrics-collection)
39. [Application Metrics with prom-client](#application-metrics-with-prom-client)
40. [ServiceMonitor Configuration](#servicemonitor-configuration)
41. [Grafana Dashboards](#grafana-dashboards)
42. [Structured Logging with pino](#structured-logging-with-pino)
43. [Troubleshooting Monitoring Setup](#troubleshooting-monitoring-setup)

---

## React Fundamentals

### What is React?

React is a JavaScript library for building user interfaces. It allows you to break your UI into reusable components and manage the data that flows through them.

### Key Concepts

**1. Components**: Functions that return JSX describing what should appear on screen.

```tsx
// src/components/TaskCard.tsx:42-151
export default function TaskCard({
  task,
  onStatusChange,
  onDelete,
}: TaskCardProps) {
  // Component logic here
  return (
    <div className="group rounded-lg border...">
      {/* JSX describing the UI */}
    </div>
  );
}
```

**2. Declarative UI**: You describe *what* the UI should look like, not *how* to update it. React handles the DOM updates.

**3. Component Reusability**: Notice how `TaskCard` is used multiple times in `TaskList`:

```tsx
// src/components/TaskList.tsx:144-152
{filteredTasks.map((task) => (
  <TaskCard
    key={task.id}
    task={task}
    onStatusChange={handleStatusChange}
    onDelete={handleDelete}
  />
))}
```

---

## JSX and Template Literals

### What is JSX?

JSX is a syntax extension for JavaScript that looks like HTML but allows you to write JavaScript expressions within it.

### Template Literals in JSX

You use curly braces `{}` to embed JavaScript expressions in JSX:

```tsx
// src/components/TaskCard.tsx:82-83
<h3 className={`font-medium ${task.status === "COMPLETED" ? "line-through opacity-60" : ""}`}>
  {task.title}
</h3>
```

**Key points:**
- `{task.title}`: Renders the value of the variable
- `{task.status === "COMPLETED" ? ...}`: Conditional expression
- Backticks `` ` `` with `${}`: Template literals for strings

### Conditional Rendering

```tsx
// src/components/TaskForm.tsx:62-66
{error && (
  <div className="rounded-md bg-red-50 p-3...">
    {error}
  </div>
)}
```

This pattern: `{condition && <Component />}` only renders when condition is truthy.

### Mapping Over Arrays

```tsx
// src/components/TaskCard.tsx:123-127
{Object.entries(statusLabels).map(([value, label]) => (
  <option key={value} value={value}>
    {label}
  </option>
))}
```

**Important**: Always include a unique `key` prop when rendering lists.

---

## TypeScript in React

### Why TypeScript?

TypeScript adds static type checking to JavaScript, catching errors before runtime.

### Type Definitions

```tsx
// src/components/TaskCard.tsx:6-34 (Phase 1 subset)
interface BoardInfo {
  id: string;
  name: string;
  color: string;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  createdAt: string;
  recurringTaskId?: string | null;  // Added in Stage 2
  board?: BoardInfo | null;          // Added in Stage 2
}

interface TaskCardProps {
  task: Task;
  onStatusChange: (id: string, status: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  compact?: boolean;       // Kanban compact mode
  onExpand?: () => void;   // Click to expand in Kanban
  draggable?: boolean;     // Drag-and-drop support
  onDragStart?: () => void;
  onDragEnd?: () => void;
  isDragging?: boolean;
}
```

**Key concepts:**
- `interface`: Defines the shape of an object
- `string | null`: Union type - can be string or null
- `(id: string) => Promise<void>`: Function type returning a Promise

### Type Inference with Zod

```tsx
// src/lib/validations.ts:30-33
export type LoginInput = z.infer<typeof loginSchema>;
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
```

This automatically creates TypeScript types from Zod schemas, preventing type mismatches.

---

## Component State Management

### useState Hook

`useState` lets you add state to functional components. It returns an array: `[currentValue, setterFunction]`.

```tsx
// src/components/TaskForm.tsx:26-32
const [title, setTitle] = useState(initialData?.title ?? "");
const [description, setDescription] = useState(initialData?.description ?? "");
const [priority, setPriority] = useState(initialData?.priority ?? "MEDIUM");
const [dueDate, setDueDate] = useState(initialData?.dueDate ?? "");
const [loading, setLoading] = useState(false);
const [error, setError] = useState("");
```

**State update patterns:**
- Direct update: `setTitle(newValue)`
- Derived state: `initialData?.title ?? ""` (nullish coalescing)

### Loading States

```tsx
// src/components/TaskForm.tsx:35-58
async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  setError("");
  setLoading(true);  // Start loading

  try {
    await onSubmit({ title, description, priority, dueDate });
    // ... success handling
  } catch (err) {
    setError(err instanceof Error ? err.message : "Something went wrong");
  } finally {
    setLoading(false);  // Always stop loading
  }
}
```

This pattern ensures loading state is reset even if an error occurs.

### Boolean State for UI Toggles

```tsx
// src/components/TaskList.tsx:59-67
const [tasks, setTasks] = useState<Task[]>(initialTasks);
const [showForm, setShowForm] = useState(false);  // Toggle form visibility
const [searchQuery, setSearchQuery] = useState("");
const [searchResults, setSearchResults] = useState<Task[] | null>(null);
const [expandedId, setExpandedId] = useState<string | null>(null);  // Expanded card
const [draggedId, setDraggedId] = useState<string | null>(null);    // Drag-and-drop
```

---

## Props and Component Communication

### What are Props?

Props (properties) are how you pass data from parent to child components.

```tsx
// Parent passing props (TaskList.tsx:146-152)
<TaskCard
  key={task.id}
  task={task}                          // Object prop
  onStatusChange={handleStatusChange}  // Function prop
  onDelete={handleDelete}              // Function prop
/>
```

```tsx
// Child receiving props (TaskCard.tsx:42-46)
export default function TaskCard({
  task,
  onStatusChange,
  onDelete,
}: TaskCardProps) {
  // Component uses task, onStatusChange, onDelete
}
```

### Callback Functions

Children communicate with parents through callback functions:

```tsx
// Child triggers callback (TaskCard.tsx:49-56)
async function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
  setLoading(true);
  try {
    await onStatusChange(task.id, e.target.value);  // Call parent function
  } finally {
    setLoading(false);
  }
}
```

```tsx
// Parent handles callback (TaskList.tsx:61-70)
async function handleStatusChange(id: string, status: string) {
  const res = await fetch(`/api/tasks/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });

  if (!res.ok) throw new Error("Failed to update task");
  await refreshTasks();
}
```

**This is the primary pattern for data flow: Parent → Child (via props), Child → Parent (via callbacks).**

---

## Client vs Server Components

### "use client" Directive

```tsx
// src/components/TaskCard.tsx:1
"use client";
```

This file MUST run in the browser because it:
- Uses hooks (`useState`, `useCallback`)
- Handles user interactions (onChange, onClick)
- Manages local state

### Server Components (Default)

```tsx
// src/app/(dashboard)/dashboard/page.tsx
export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // Fetch tasks (with board relation) and boards in parallel
  const [tasks, boards] = await Promise.all([
    prisma.task.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      include: { board: { select: { id: true, name: true, color: true } } },
    }),
    prisma.board.findMany({
      where: { team: { members: { some: { userId: session.user.id } } } },
      include: { team: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Serialize Date objects for client component
  const serializedTasks = tasks.map((t) => ({
    ...t,
    dueDate: t.dueDate?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
  }));

  return (
    <>
      <Navbar />
      <main className="...">
        <StatsWidget />
        <TaskList initialTasks={serializedTasks} boards={serializedBoards} />
      </main>
    </>
  );
}
```

Server components:
- Run only on the server
- Can directly access database and server-side APIs
- Don't send JavaScript to the client
- Better for SEO and initial page load

### The Hybrid Pattern

Your app uses a hybrid approach:
- Server components fetch data and pass it down
- Client components handle interactivity

```tsx
// Server component fetches data in parallel
const [tasks, boards] = await Promise.all([
  prisma.task.findMany({ where: { userId: session.user.id }, include: { board: ... } }),
  prisma.board.findMany({ where: { team: { members: { some: { userId: ... } } } } }),
]);

// Serializes Date objects to strings before passing to client
const serialized = tasks.map((t) => ({
  ...t,
  dueDate: t.dueDate?.toISOString() ?? null,
  createdAt: t.createdAt.toISOString(),
}));

// Passes to client component
<TaskList initialTasks={serialized} boards={serializedBoards} />
```

---

## Next.js App Router

### File-Based Routing

Your route structure maps to the URL:
- `/login` → `src/app/(auth)/login/page.tsx`
- `/register` → `src/app/(auth)/register/page.tsx`
- `/dashboard` → `src/app/(dashboard)/dashboard/page.tsx`

### Route Groups with Parentheses

```tsx
src/app/
├── (auth)/          # Route group - doesn't affect URL
│   ├── login/
│   └── register/
└── (dashboard)/     # Route group - doesn't affect URL
    └── dashboard/
```

The `(auth)` and `(dashboard)` folders are route groups - they organize files without affecting the URL. `/login` works, not `/(auth)/login`.

### Dynamic Route Parameters

```tsx
// src/app/api/tasks/[id]/route.ts
// URL: /api/tasks/abc123
// id = "abc123"
```

The `[id]` is a dynamic segment that captures the value.

### Server-Side Redirects

```tsx
// src/app/(dashboard)/dashboard/page.tsx:8-9
const session = await auth();
if (!session?.user?.id) redirect("/login");
```

Server-side redirects happen before the page renders, improving security and UX.

---

## API Routes

### API Route Handlers

Next.js App Router uses file-based API routes:

```tsx
// src/app/api/tasks/route.ts:6-25
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tasks = await prisma.task.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(tasks);
  } catch {
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

### POST Request Handler

```tsx
// src/app/api/tasks/route.ts:38-77
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();  // Parse request body
    const parsed = taskCreateSchema.safeParse(body);  // Validate

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

    // Fire-and-forget: realtime WebSocket + webhook delivery
    emitToRealtime("task:created", task);
    triggerWebhook("task.created", task, session.user.id);

    return NextResponse.json(task, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

### API Client Usage

```tsx
// src/components/TaskList.tsx:40-59
async function handleCreate(data: { title: string; description?: string; ... }) {
  const res = await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to create task");
  }

  setShowForm(false);
  await refreshTasks();
}
```

---

## Authentication with NextAuth v5

### NextAuth Configuration

```tsx
// src/lib/auth.ts:8-58
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",  // Custom sign-in page
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user || !user.password) return null;

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;  // Add user ID to token
      }
      return token;
    },
    async session({ session, token }) {
      if (session?.user) {
        session.user.id = token.id as string;  // Add ID to session
      }
      return session;
    },
  },
});
```

**Key concepts:**
- **Credentials Provider**: Allows email/password authentication
- **JWT Strategy**: Stores session data in a JWT token (vs database sessions)
- **Callbacks**: Modify the token and session to include custom data (like `id`)
- **Authorize Function**: Verifies credentials and returns user object

### Using Auth in Server Components

```tsx
// src/app/(dashboard)/dashboard/page.tsx:8-9
const session = await auth();
if (!session?.user?.id) redirect("/login");
```

### Using Auth in Client Components

```tsx
// src/components/AuthForm.tsx:40-52
const result = await signIn("credentials", {
  email,
  password,
  redirect: false,
});

if (result?.error) {
  setError("Invalid email or password");
  return;
}

router.push("/dashboard");
router.refresh();
```

### Protected API Routes

```tsx
// src/app/api/tasks/route.ts:29-32
const session = await auth();
if (!session?.user?.id) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

Always check the session on the server, even if the client is authenticated.

---

## Database ORM with Prisma

### Prisma Schema

```prisma
// prisma/schema.prisma (Phase 1 subset — see actual file for full model)
model Task {
  id          String       @id @default(cuid())
  title       String
  description String?
  status      TaskStatus   @default(TODO)
  priority    TaskPriority @default(MEDIUM)
  dueDate     DateTime?
  userId      String
  user        User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Added in Stage 2 (microservices expansion):
  attachments    Attachment[]
  boardId        String?
  board          Board?        @relation(fields: [boardId], references: [id], onDelete: SetNull)
  assigneeId     String?
  assignee       User?         @relation("TaskAssignee", fields: [assigneeId], references: [id], onDelete: SetNull)
  recurringTaskId String?
  recurringTask  RecurringTask? @relation(fields: [recurringTaskId], references: [id], onDelete: SetNull)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
  @@index([status])
  @@index([createdAt])
  @@index([dueDate])
  @@index([boardId])
  @@index([assigneeId])
}
```

**Key concepts:**
- `@id`: Primary key field
- `@default(cuid())`: Auto-generate unique ID
- `String?`: Optional field (e.g., `boardId`, `dueDate`)
- `@relation`: Defines relationships between models (e.g., `board`, `assignee`, `recurringTask`)
- `onDelete: Cascade`: Delete child records when parent is deleted
- `onDelete: SetNull`: Set FK to null when referenced record is deleted
- `@@index`: Database index for query optimization

### Prisma Client Initialization

```tsx
// src/lib/prisma.ts:8-15
function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

This creates a global singleton to avoid multiple instances in development (hot-reload).

### Querying Data

```tsx
// src/app/(dashboard)/dashboard/page.tsx:11-14
const tasks = await prisma.task.findMany({
  where: { userId: session.user.id },  // Filter by user
  orderBy: { createdAt: "desc" },      // Sort by creation date
});
```

### Creating Data

```tsx
// src/app/api/tasks/route.ts:46-55
const task = await prisma.task.create({
  data: {
    title,
    description,
    status: status || "TODO",
    priority: priority || "MEDIUM",
    dueDate: dueDate ? new Date(dueDate) : null,
    userId: session.user.id,
  },
});
```

### Type Safety

Prisma generates TypeScript types automatically:

```tsx
// inferred types from Prisma schema
const task: Task = await prisma.task.findUnique(...);
// task.title is known to be string
// task.dueDate is known to be DateTime | null
```

---

## Form Validation with Zod

### What is Zod?

Zod is a TypeScript-first schema validation library. It validates input and generates TypeScript types.

### Defining Schemas

```tsx
// src/lib/validations.ts:3-6
export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});
```

**Validation rules:**
- `z.string()`: Must be a string
- `.email()`: Must be a valid email
- `.min(6)`: Minimum length of 6
- Custom error messages in quotes

### Complex Schemas

```tsx
// src/lib/validations.ts:14-21
export const taskCreateSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(1000).optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "COMPLETED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  dueDate: z.string().optional(),
  boardId: z.string().nullable().optional(),  // Added in Stage 2
});
```

- `z.enum([...])`: Must be one of the specified values
- `.optional()`: Field is not required

### Validating Input

```tsx
// src/app/api/tasks/route.ts:47-58
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

**`safeParse()` returns:**
- `success: true` with `data` if valid
- `success: false` with `error.issues` if invalid

### Type Inference

```tsx
// src/lib/validations.ts:30-33
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;
```

`z.infer<Schema>` automatically creates a TypeScript type matching the schema.

---

## Testing with Jest and React Testing Library

### What is Jest?

Jest is a JavaScript testing framework. React Testing Library helps you test React components.

### Test Configuration

```tsx
// jest.config.ts:8-14
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
// jest.setup.ts:1
import "@testing-library/jest-dom";
```

This adds custom matchers like `.toBeInTheDocument()`.

### Component Testing Example

```tsx
// src/components/__tests__/TaskCard.test.tsx:19-50
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
});
```

**Testing patterns:**
- `render(<Component />)`: Renders component in test environment
- `screen.getByText()`: Finds element by text content
- `expect(...).toBeInTheDocument()`: Assertion
- `expect(...).toHaveValue()`: Check input value
- `expect(...).toHaveClass()`: Check CSS class

### Mocking Async Handlers

```tsx
// src/components/__tests__/TaskCard.test.tsx:14-17
const mockHandlers = {
  onStatusChange: jest.fn().mockResolvedValue(undefined),
  onDelete: jest.fn().mockResolvedValue(undefined),
};
```

`.mockResolvedValue(undefined)` makes async handlers resolve immediately in tests.

---

## Tailwind CSS v4

### What's New in v4?

Tailwind v4 uses a new `@import` syntax instead of `@tailwind` directives:

```css
/* src/app/globals.css:1 */
@import "tailwindcss";
```

### Utility-First CSS

Instead of writing custom CSS, you use utility classes:

```tsx
// src/components/TaskCard.tsx:74
<div className="group rounded-lg border border-zinc-200 bg-white p-4...">
```

**Class breakdown:**
- `group`: Enables group-hover states
- `rounded-lg`: Rounded corners
- `border`: Adds border
- `border-zinc-200`: Border color
- `bg-white`: Background color
- `p-4`: Padding (1rem)

### Dark Mode Support

```tsx
// src/components/TaskCard.tsx:74
<div className="... dark:border-zinc-800 dark:bg-zinc-900">
```

- `dark:` prefix applies styles when dark mode is active

### Conditional Classes

```tsx
// src/components/TaskCard.tsx:78-80
<h3 className={`font-medium ${task.status === "COMPLETED" ? "line-through opacity-60" : ""}`}>
  {task.title}
</h3>
```

Use template literals with conditional logic for dynamic classes.

### Responsive Design

```css
/* src/app/globals.css:15-20 */
@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #ededed;
  }
}
```

Tailwind also supports responsive prefixes like `md:`, `lg:`, etc.

### Custom Utilities

```css
/* src/app/globals.css:27-34 */
@layer utilities {
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
}
```

You can extend Tailwind with custom utilities in the `@layer utilities` block.

---

## Key Patterns and Best Practices

### 1. Error Handling Pattern

```tsx
try {
  // Attempt operation
  await onSubmit(data);
} catch (err) {
  // Handle error
  setError(err instanceof Error ? err.message : "Something went wrong");
} finally {
  // Always execute (e.g., reset loading state)
  setLoading(false);
}
```

### 2. Async Data Fetching Pattern

```tsx
// src/components/TaskList.tsx:28-38
const refreshTasks = useCallback(async () => {
  try {
    const res = await fetch("/api/tasks");
    if (res.ok) {
      const data = await res.json();
      setTasks(data);
    }
  } catch {
    /* ignore errors silently or handle them */
  }
}, []);
```

`useCallback` memoizes the function to prevent unnecessary re-renders.

### 3. Form Submission Pattern

```tsx
async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();  // Prevent default form submission
  setError("");
  setLoading(true);

  try {
    await onSubmit(data);
    // Reset form on success
    setTitle("");
    setDescription("");
  } catch (err) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
}
```

### 4. Data Serialization for Server → Client

```tsx
// src/app/(dashboard)/dashboard/page.tsx:16-20
const serialized = tasks.map((t) => ({
  ...t,
  dueDate: t.dueDate?.toISOString() ?? null,
  createdAt: t.createdAt.toISOString(),
}));
```

Database Date objects must be serialized to ISO strings before sending to client.

### 5. Kanban Column Derivation Pattern

```tsx
// src/components/TaskList.tsx — tasks grouped by status into columns
const COLUMNS = [
  { key: "TODO", label: "To Do", ... },
  { key: "IN_PROGRESS", label: "In Progress", ... },
  { key: "COMPLETED", label: "Completed", ... },
] as const;

// Filter tasks into each column
const columnTasks = (col: string) =>
  (searchResults ?? tasks).filter((t) => t.status === col);
```

Tasks are derived from the flat array into Kanban columns using `.filter()`. No separate state needed — the source of truth is one `tasks` array.

### 6. Search with Meilisearch Pattern

```tsx
// src/components/TaskList.tsx — search queries the Meilisearch API
async function handleSearch(q: string) {
  if (!q.trim()) return setSearchResults(null);
  const res = await fetch(`/api/tasks/search?q=${encodeURIComponent(q)}`);
  if (res.ok) setSearchResults(await res.json());
}
```

Search results override the task list when active (`searchResults ?? tasks`). Clearing search restores the full list.

### 7. Drag-and-Drop Pattern

```tsx
// src/components/TaskList.tsx — HTML5 drag-and-drop for status changes
<div
  onDragOver={(e) => { e.preventDefault(); setDragOverCol(col); }}
  onDrop={() => { if (draggedId) handleStatusChange(draggedId, col); setDraggedId(null); }}
>
  {columnTasks(col).map((task) => (
    <TaskCard key={task.id} task={task} draggable onDragStart={() => setDraggedId(task.id)} />
  ))}
</div>
```

Dragging a card to a new column triggers a status update API call and refreshes the task list.

### 8. Protected Route Pattern

```tsx
// Server component
export default async function ProtectedPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  // ...
}

// API route
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // ...
}
```

Always protect both server components and API routes.

### 9. Environment Variables

```bash
# .env
DATABASE_URL=postgresql://...
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key
```

Never commit `.env` files. Use `.env.example` as a template.

### 10. Type Safety Throughout

```tsx
// Define types
interface Task { id: string; title: string; ... }
interface TaskCardProps { task: Task; ... }

// Use types in components
export default function TaskCard({ task, ... }: TaskCardProps) { ... }

// Validate with Zod
const schema = z.object({ title: z.string() });
type Input = z.infer<typeof schema>;
```

Type safety catches errors at compile time, not runtime.

---

## What You've Learned in Phase 1

### Technologies Mastered:
- ✅ React components and hooks
- ✅ TypeScript for type safety
- ✅ Next.js App Router and server components
- ✅ API route handlers
- ✅ Authentication with NextAuth v5
- ✅ Database operations with Prisma
- ✅ Form validation with Zod
- ✅ Testing with Jest and React Testing Library
- ✅ Styling with Tailwind CSS v4

### Core Concepts:
- ✅ Component composition and reusability
- ✅ State management with hooks
- ✅ Props drilling and callbacks
- ✅ Client vs server components
- ✅ Async/await patterns
- ✅ Error handling
- ✅ Data validation
- ✅ Authentication flows
- ✅ Database relationships

### Best Practices:
- ✅ Type-safe development
- ✅ Server-side rendering for performance
- ✅ Protected routes and API endpoints
- ✅ Proper error handling
- ✅ Loading states
- ✅ Form validation
- ✅ Testing components
- ✅ Responsive design

---

## Next Steps: Phase 2

In Phase 2, you'll learn:
- Docker fundamentals and containerization
- Building multi-stage Docker images
- Docker Compose for orchestration
- Environment configuration management
- Health checks and monitoring

This will prepare your application for deployment and scaling.

---

## Docker Fundamentals

### What is Docker?

Docker is a platform for developing, shipping, and running applications in containers. Containers are lightweight, standalone packages that include everything needed to run an application: code, runtime, system tools, libraries, and settings.

### Key Concepts

**1. Docker Images**: Read-only templates used to create containers. Images contain your application code, dependencies, and configuration.

```dockerfile
# Your Dockerfile defines how to build an image
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
CMD ["npm", "start"]
```

**2. Docker Containers**: Running instances of Docker images. You can start, stop, and manage containers.

```bash
# Build an image
docker build -t task-manager-app .

# Run a container
docker run -p 3000:3000 task-manager-app

# List running containers
docker ps
```

**3. Volumes**: Persistent storage that survives container restarts. Used for databases and stateful data.

**4. Networks**: Isolated communication channels between containers. Services on the same network can communicate by service name.

**5. Docker Daemon**: The background service that manages containers, images, volumes, and networks.

### Why Use Docker?

- **Consistency**: Runs the same way everywhere (dev, staging, production)
- **Isolation**: Dependencies are packaged, no conflicts with host system
- **Reproducibility**: Same image produces same behavior every time
- **Scalability**: Easy to scale horizontally with orchestrators
- **Portability**: Run on any platform with Docker installed

---

## Multi-Stage Docker Builds

### What Are Multi-Stage Builds?

Multi-stage builds use multiple `FROM` statements in a single Dockerfile. Each stage creates an intermediate image, and you can copy artifacts from previous stages. This reduces the final image size by excluding build tools and dependencies.

### Your Project's Multi-Stage Dockerfile

```dockerfile
# task-manager/Dockerfile:1-46

ARG NODE_VERSION=22-slim

# Stage 1: Dependencies
FROM node:${NODE_VERSION} AS dependencies

WORKDIR /app

COPY package.json package-lock.json* ./

RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# Stage 2: Builder
FROM node:${NODE_VERSION} AS builder

WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules

COPY . .

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN npx prisma generate && npm run build

# Stage 3: Runner (minimal production image)
FROM node:${NODE_VERSION} AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
```

### Breakdown of Each Stage

**Stage 1: Dependencies**
- Caches npm packages separately from source code
- Uses BuildKit cache mounts to speed up rebuilds
- `npm ci` installs exact versions from package-lock.json

**Stage 2: Builder**
- Copies dependencies and source code
- Generates Prisma client
- Builds Next.js with standalone output
- Produces `.next/standalone/` directory

**Stage 3: Runner**
- Non-root user for security (`nextjs:nodejs`)
- Only copies what's needed to run:
  - `public/` folder (static assets)
  - `.next/standalone/` (minimal Next.js server)
  - `.next/static/` (optimized static files)
- **No source code, no dev dependencies, no build tools**

### Why This Matters

| Without Multi-Stage | With Multi-Stage |
|---------------------|------------------|
| ~1GB+ image | ~200MB image |
| Includes dev dependencies | Only runtime dependencies |
| Security risk (more attack surface) | Minimal attack surface |
| Slower pulls | Faster pulls |

---

## .dockerignore

### What is .dockerignore?

Similar to `.gitignore`, `.dockerignore` specifies files and directories that should NOT be copied into the Docker build context. This reduces build time and image size.

### Your Project's .dockerignore

```dockerfile
# task-manager/.dockerignore

node_modules
**/node_modules
.next
**/.next
**/src/generated
.git
.gitignore
.env
.env.*
coverage
src/generated
*.md
Dockerfile
docker-compose*.yml
.dockerignore
helm-chart
scripts
.swc
**/*.log
```

### What's Excluded and Why

| Excluded | Reason |
|----------|--------|
| `node_modules`, `**/node_modules` | Rebuilt inside container with correct OS binaries (glob catches nested service node_modules) |
| `.next`, `**/.next` | Rebuilt during Docker build process |
| `**/src/generated`, `src/generated` | Prisma client regenerated during build |
| `.git` | Repository metadata not needed in production |
| `.env*` | Secrets should be passed via environment variables |
| `coverage` | Test coverage reports not needed in production |
| `*.md` | Documentation not needed in container |
| `Dockerfile`, `docker-compose*.yml` | Docker configs not needed inside container |
| `helm-chart` | Kubernetes manifests not needed inside container |
| `scripts` | Build/setup scripts not needed at runtime |
| `.swc` | SWC compiler cache |
| `**/*.log` | Log files |
| `.dockerignore` | This file itself |

### Impact on Build Context

**Without .dockerignore:**
```
Sending build context to Docker daemon  1.37GB
```

**With .dockerignore:**
```
Sending build context to Docker daemon   1.48MB
```

Huge difference in build speed, especially with `node_modules`.

---

## Docker Compose

### What is Docker Compose?

Docker Compose is a tool for defining and running multi-container Docker applications. It uses YAML files to configure application services.

### Your Project's docker-compose.yml

```yaml
# task-manager/docker-compose.yml:1-37

services:
  db:
    image: postgres:17-alpine
    container_name: task-manager-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: taskmanager
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: task-manager-app
    restart: unless-stopped
    environment:
      DATABASE_URL: postgresql://postgres:postgres@db:5432/taskmanager
      NEXTAUTH_URL: http://localhost:3000
      NEXTAUTH_SECRET: local-dev-secret-change-in-production
      AUTH_TRUST_HOST: "true"
    ports:
      - "3000:3000"
    depends_on:
      db:
        condition: service_healthy

volumes:
  pgdata:
```

### Service Configuration Breakdown

**db Service (PostgreSQL):**
- `image: postgres:17-alpine` - Official PostgreSQL image, Alpine variant for minimal size
- `container_name` - Fixed container name for easy reference
- `restart: unless-stopped` - Auto-restart on failure
- `ports: "5432:5432"` - Maps host port 5432 to container port 5432
- `volumes: pgdata:/var/lib/postgresql/data` - Persists data in named volume
- `healthcheck` - PostgreSQL ready check before app starts

**app Service (Next.js):**
- `build: { context: ., dockerfile: Dockerfile }` - Build image from current directory
- `environment` - App configuration variables
- `DATABASE_URL` uses `db` as hostname (Docker network resolution)
- `AUTH_TRUST_HOST=true` - Required for NextAuth v5 in production mode
- `depends_on` - Waits for db health check before starting

### Docker Compose Commands

```bash
# Build and start all services
docker compose up -d --build

# Stop all services
docker compose down

# Stop and remove volumes (deletes database)
docker compose down -v

# View service status
docker compose ps

# View logs
docker compose logs -f app
docker compose logs -f db

# Execute command in container
docker compose exec app ls -la
docker compose exec db psql -U postgres -d taskmanager

# Restart a service
docker compose restart app

# Rebuild a specific service
docker compose up -d --build app
```

### Pushing Database Schema

Since the runner image doesn't include Prisma CLI, run schema pushes from the host:

```bash
# Start containers first
docker compose up -d --build

# Push schema from host (port 5432 mapped to localhost)
set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/taskmanager
npx prisma db push
```

---

## Health Checks and Dependencies

### What Are Health Checks?

Health checks verify that a service is ready to accept requests. Docker Compose uses health checks to manage service startup order.

### Your PostgreSQL Health Check

```yaml
# task-manager/docker-compose.yml:14-18

healthcheck:
  test: ["CMD-SHELL", "pg_isready -U postgres"]
  interval: 10s
  timeout: 5s
  retries: 5
```

**Parameters:**
- `test` - Command to check health
- `interval` - Run check every 10 seconds
- `timeout` - Wait 5 seconds for response
- `retries` - Fail after 5 consecutive failures

### Depends_on with Health Condition

```yaml
# task-manager/docker-compose.yml:32-34

depends_on:
  db:
    condition: service_healthy
```

This ensures the app waits for PostgreSQL to be healthy before starting. Without this, the app might crash trying to connect to a database that's still initializing.

### Viewing Health Status

```bash
# Check service health
docker compose ps

# Output example:
NAME                  STATUS                    PORTS
task-manager-app      Up 5 minutes (healthy)    0.0.0.0:3000->3000/tcp
task-manager-db       Up 5 minutes (healthy)    0.0.0.0:5432->5432/tcp
```

---

## Docker Environment Variables

### Why Environment Variables?

Environment variables allow you to configure applications without changing code. Different environments (dev, staging, production) can have different configurations.

### Environment Variables in docker-compose.yml

```yaml
# task-manager/docker-compose.yml:26-30

environment:
  DATABASE_URL: postgresql://postgres:postgres@db:5432/taskmanager
  NEXTAUTH_URL: http://localhost:3000
  NEXTAUTH_SECRET: local-dev-secret-change-in-production
  AUTH_TRUST_HOST: "true"
```

### How They Work

1. **Container Runtime**: Variables are injected into the container's environment
2. **Application Access**: Node.js reads via `process.env.VARIABLE_NAME`
3. **Build vs Runtime**: Some variables needed at build time, others at runtime

### Security Best Practices

**❌ Bad (secrets in docker-compose.yml):**
```yaml
environment:
  DATABASE_PASSWORD: super-secret-password  # Committed to Git!
```

**✅ Good (use .env file or secrets management):**
```yaml
env_file:
  - .env.docker

# Or use Docker Secrets in production
secrets:
  - db_password
```

For this learning project, using environment variables directly is acceptable. In production, use secrets management.

---

## Docker Best Practices

### 1. Use Minimal Base Images

**❌ Avoid:**
```dockerfile
FROM node:22  # ~1GB
```

**✅ Prefer:**
```dockerfile
FROM node:22-slim  # ~200MB
```

### 2. Leverage BuildKit Caches

```dockerfile
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund
```

Cache mounts speed up rebuilds by reusing downloaded packages.

### 3. Run as Non-Root User

```dockerfile
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

USER nextjs
```

Reduces security risk if container is compromised.

### 4. Use .dockerignore

Exclude unnecessary files to reduce build context size and build time.

### 5. Enable Health Checks

Ensure dependencies are ready before starting dependent services.

### 6. Use Named Volumes for Persistence

```yaml
volumes:
  pgdata:  # Named volume survives container restart
```

### 7. Don't Run Prisma CLI in Runner Image

The runner image is minimal and doesn't include build tools. Run schema migrations from the host machine.

### 8. Set Resource Limits (for production)

```yaml
deploy:
  resources:
    limits:
      cpus: '0.5'
      memory: 512M
    reservations:
      cpus: '0.25'
      memory: 256M
```

### 9. Tag Images Properly

```bash
# Bad
docker build -t app .

# Good
docker build -t task-manager-app:1.0.0 .
docker build -t task-manager-app:latest .
docker build -t username/task-manager-app:1.0.0 .
```

### 10. Use Multi-Stage Builds

Separate build dependencies from runtime dependencies to minimize image size.

---

## Common Issues and Solutions

### Issue 1: UntrustedHost Error with NextAuth

**Error:**
```
[auth][error] UntrustedHost: Host must be trusted
```

**Cause:** NextAuth v5 requires explicit trust in production mode.

**Solution:**
```yaml
environment:
  AUTH_TRUST_HOST: "true"
```

### Issue 2: Database Connection Failures

**Error:**
```
Can't reach database server at `db:5432`
```

**Cause:** App starting before database is ready.

**Solution:** Use health checks in depends_on:
```yaml
depends_on:
  db:
    condition: service_healthy
```

### Issue 3: Slow Build Times

**Cause:** Reinstalling dependencies on every build.

**Solution:** Use BuildKit cache mounts:
```dockerfile
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund
```

### Issue 4: Large Image Size

**Cause:** Including unnecessary files in image.

**Solutions:**
- Use `.dockerignore`
- Use multi-stage builds
- Use minimal base images (alpine/slim)

### Issue 5: Port Already in Use

**Error:**
```
Error starting userland proxy: listen tcp 0.0.0.0:3000: bind: address already in use
```

**Cause:** Another process using port 3000.

**Solution:**
```bash
# Find and stop the process
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Or use a different port
ports:
  - "3001:3000"
```

### Issue 6: Permission Denied for Volumes (Linux)

**Error:**
```
Permission denied: './public'
```

**Cause:** Volume created with wrong ownership.

**Solution:**
```dockerfile
RUN chown -R nextjs:nodejs /app
```

---

## What You've Learned in Phase 2

### Technologies Mastered:
- ✅ Docker fundamentals and concepts
- ✅ Multi-stage Docker builds
- ✅ Dockerfile optimization techniques
- ✅ Docker Compose orchestration
- ✅ Health checks and service dependencies
- ✅ Docker volumes and persistence
- ✅ Docker networks and communication
- ✅ Environment variable management
- ✅ BuildKit cache optimization

### Core Concepts:
- ✅ Container isolation and portability
- ✅ Image layering and caching
- ✅ Build context optimization with .dockerignore
- ✅ Service orchestration with Docker Compose
- ✅ Startup order management
- ✅ Persistent data management
- ✅ Security best practices (non-root users, minimal images)
- ✅ Production-ready container patterns

### Best Practices:
- ✅ Multi-stage builds for minimal images
- ✅ Health checks for reliable service startup
- ✅ Non-root user for security
- ✅ Named volumes for data persistence
- ✅ BuildKit caches for faster builds
- ✅ Proper environment variable configuration
- ✅ Tagging and versioning images
- ✅ Debugging and troubleshooting containers

---

## Next Steps: Phase 3

In Phase 3, you'll learn:
- GitHub Actions workflows and CI/CD pipelines
- Automated testing in CI
- Docker image building and pushing to registries
- Security scanning integration
- Deployment automation
- GitOps principles

This will automate your build, test, and deployment processes.

---

## GitHub Actions Fundamentals

### What is GitHub Actions?

GitHub Actions is a CI/CD platform built into GitHub. It automates workflows (build, test, deploy) directly from your repository. Workflows are defined in YAML files and triggered by events like pushes, pull requests, or schedules.

### Key Concepts

**1. Workflows**: Automated processes defined in `.github/workflows/`. A repository can have multiple workflows.

```yaml
# .github/workflows/ci.yml
name: CI Pipeline

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
```

**2. Events**: Triggers that start workflows. Common events:
- `push` - Code pushed to a branch
- `pull_request` - PR opened, updated, or merged
- `schedule` - Cron-based scheduling
- `workflow_dispatch` - Manual trigger

**3. Jobs**: Groups of steps that execute on the same runner. Jobs can run in parallel or sequentially with dependencies.

```yaml
jobs:
  quality:        # Job 1
    runs-on: ubuntu-latest
    steps: [...]

  security:       # Job 2 (runs in parallel with quality)
    runs-on: ubuntu-latest
    steps: [...]

  docker:         # Job 3 (waits for quality + security)
    needs: [quality, security]
    runs-on: ubuntu-latest
    steps: [...]
```

**4. Steps**: Individual tasks within a job. Each step runs in order on the same runner.

**5. Runners**: Servers that execute workflows. GitHub provides `ubuntu-latest`, `windows-latest`, `macos-latest`.

### Why CI/CD Matters

- **Catch bugs early**: Every push is tested automatically
- **Consistency**: Same build process every time
- **Confidence**: Code passes quality gates before merging
- **Automation**: No manual build/deploy steps

---

## Your CI Pipeline

### Pipeline Structure

Your pipeline has three jobs with a clear dependency chain:

```
push/PR to main
       │
       ├── quality (lint, type-check, test)
       │
       ├── security (npm audit, Trivy scan)
       │
       └── docker (build & push image)
              │
              └── only if quality + security pass
              └── only on main push (not PRs)
```

### Complete Workflow File

```yaml
# .github/workflows/ci.yml

name: CI Pipeline

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

defaults:
  run:
    working-directory: task-manager

jobs:
  quality:
    name: Quality Gates
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: task-manager/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Generate Prisma client
        run: npx prisma generate

      - name: Lint
        run: npm run lint

      - name: Type check
        run: npm run type-check

      - name: Run tests
        run: npm test

  security:
    name: Security Scan
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: task-manager

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: task-manager/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: npm audit
        run: npm audit --audit-level=high

      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: fs
          scan-ref: ./task-manager
          severity: HIGH,CRITICAL

  docker:
    name: Build & Push Docker Image
    runs-on: ubuntu-latest
    needs: [quality, security]
    if: github.event_name == 'push'

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ secrets.DOCKER_USERNAME }}/task-manager-app
          tags: |
            type=sha
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: ./task-manager
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

---

## Quality Gates Job

### What Are Quality Gates?

Quality gates are automated checks that code must pass before it can be merged or deployed. They catch bugs, style issues, and type errors early.

### Step-by-Step Breakdown

**Checkout Code:**
```yaml
- name: Checkout code
  uses: actions/checkout@v4
```
Clones your repository onto the runner. Every workflow starts here.

**Setup Node.js with Caching:**
```yaml
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: 22
    cache: npm
    cache-dependency-path: task-manager/package-lock.json
```
- Installs Node.js 22 on the runner
- `cache: npm` caches downloaded packages between runs (faster builds)
- `cache-dependency-path` tells the cache where to find the lock file

**Install Dependencies:**
```yaml
- name: Install dependencies
  run: npm ci
```
`npm ci` installs exact versions from package-lock.json. Cleaner than `npm install` for CI.

**Generate Prisma Client:**
```yaml
- name: Generate Prisma client
  run: npx prisma generate
```
Required before type-check and build. Generates the Prisma client to `src/generated/prisma/`.

**Lint, Type Check, Test:**
```yaml
- name: Lint
  run: npm run lint

- name: Type check
  run: npm run type-check

- name: Run tests
  run: npm test
```
Each step runs in sequence. If any fails, the job stops and reports failure.

### Why This Order?

1. `npm ci` — must install before anything
2. `prisma generate` — must generate before type-check
3. `lint` — fastest check, catches style issues first
4. `type-check` — medium speed, catches type errors
5. `test` — slowest, catches logic errors

Fastest checks first means you get feedback quickly on failures.

---

## Security Scanning Job

### What is Security Scanning?

Security scanning identifies known vulnerabilities in dependencies and code. It runs in parallel with quality gates for faster feedback.

### npm audit

```yaml
- name: npm audit
  run: npm audit --audit-level=high
```

- Scans `package-lock.json` for known vulnerabilities
- `--audit-level=high` only fails on HIGH or CRITICAL vulnerabilities
- Low/moderate vulnerabilities are reported but don't block the pipeline

### Trivy Vulnerability Scanner

```yaml
- name: Run Trivy vulnerability scanner
  uses: aquasecurity/trivy-action@master
  with:
    scan-type: fs
    scan-ref: ./task-manager
    severity: HIGH,CRITICAL
```

- Trivy scans the filesystem for vulnerabilities
- `scan-type: fs` — scans files, not container images
- `scan-ref: ./task-manager` — directory to scan
- `severity: HIGH,CRITICAL` — only reports severe issues

### Why Two Scanners?

| Scanner | What it checks |
|---------|---------------|
| `npm audit` | npm package vulnerabilities |
| Trivy | Broader: dependencies, config files, licenses |

---

## Docker Build & Push Job

### What This Job Does

After quality and security pass, this job builds the Docker image and pushes it to Docker Hub. This makes the image available for deployment.

### Dependency Management

```yaml
needs: [quality, security]
if: github.event_name == 'push'
```

- `needs: [quality, security]` — waits for both jobs to pass
- `if: github.event_name == 'push'` — only runs on direct pushes (not PRs)

### Docker Buildx Setup

```yaml
- name: Set up Docker Buildx
  uses: docker/setup-buildx-action@v3
```

Buildx enables advanced Docker build features:
- BuildKit caching (faster rebuilds)
- Multi-platform builds (amd64, arm64)
- GitHub Actions cache backend

### Docker Hub Authentication

```yaml
- name: Log in to Docker Hub
  uses: docker/login-action@v3
  with:
    username: ${{ secrets.DOCKER_USERNAME }}
    password: ${{ secrets.DOCKER_PASSWORD }}
```

Uses GitHub Secrets (never hardcoded in the workflow):
- `DOCKER_USERNAME` — your Docker Hub username
- `DOCKER_PASSWORD` — a Docker Hub access token (not your password)

### Image Tagging Strategy

```yaml
- name: Extract metadata
  id: meta
  uses: docker/metadata-action@v5
  with:
    images: ${{ secrets.DOCKER_USERNAME }}/task-manager-app
    tags: |
      type=sha
      type=raw,value=latest,enable={{is_default_branch}}
```

Each build gets two tags:
- `sha-<commit-hash>` — unique tag for every build (e.g., `sha-a1b2c3d`)
- `latest` — always points to the most recent main build

### Build with Caching

```yaml
- name: Build and push
  uses: docker/build-push-action@v5
  with:
    context: ./task-manager
    push: true
    tags: ${{ steps.meta.outputs.tags }}
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

- `context: ./task-manager` — Docker build context points to the app directory
- `push: true` — pushes image to Docker Hub
- `cache-from: type=gha` — uses GitHub Actions cache for Docker layers
- `cache-to: type=gha,mode=max` — caches all layers for maximum cache hits

---

## GitHub Secrets Configuration

### Setting Up Secrets

GitHub Secrets store sensitive data that workflows need. They're encrypted and never exposed in logs.

**Steps:**
1. Go to your repository on GitHub
2. Navigate to **Settings > Secrets and variables > Actions**
3. Click **New repository secret**
4. Add each secret

### Required Secrets

| Secret | Description | How to get |
|--------|-------------|------------|
| `DOCKER_USERNAME` | Your Docker Hub username | Your Docker Hub account |
| `DOCKER_PASSWORD` | Docker Hub access token | Docker Hub > Account Settings > Security > New Access Token |

### Creating a Docker Hub Access Token

```bash
# 1. Go to https://hub.docker.com/settings/security
# 2. Click "New Access Token"
# 3. Give it a description (e.g., "GitHub Actions")
# 4. Copy the token (you won't see it again)
# 5. Add it as DOCKER_PASSWORD in GitHub Secrets
```

### Why Access Tokens Instead of Passwords?

- Tokens can be scoped (limited permissions)
- Tokens can be revoked without changing your password
- Tokens don't require 2FA in CI
- Tokens are disposable

---

## CI/CD Best Practices

### 1. Fast Feedback Loop

Put fastest checks first. Linting is instant, type-checking takes seconds, tests take minutes.

### 2. Parallel Jobs

Run independent jobs in parallel. Quality and security don't depend on each other.

### 3. Caching Strategy

```yaml
cache: npm                           # Cache npm packages
cache-from: type=gha                 # Cache Docker layers
```

Caching reduces build times from minutes to seconds on repeat runs.

### 4. Branch Protection

Configure in GitHub: **Settings > Branches > Branch protection rules**
- Require CI to pass before merging
- Require pull request reviews
- Dismiss stale reviews on push

### 5. Minimal Permissions

Only push Docker images on main branch. PRs only run quality and security checks.

### 6. Proper Tagging

Use `sha-<hash>` tags for traceability. Every image is linked to a specific commit.

### 7. Fail Fast

Use `--audit-level=high` and `severity: HIGH,CRITICAL` to only block on serious issues. Low-severity findings can be addressed separately.

---

## CI/CD Commands

### Monitoring Workflows

```bash
# List recent workflow runs
gh run list

# View specific run details
gh run view <run-id>

# View run logs
gh run view <run-id> --log

# Watch a run in real-time
gh run watch

# Re-run a failed workflow
gh run rerun <run-id>
```

### Manual Triggers

```bash
# Trigger workflow manually (requires workflow_dispatch in on:)
gh workflow run ci.yml

# Trigger with parameters
gh workflow run ci.yml -f environment=staging
```

### Debugging Failed Runs

```bash
# View failed step logs
gh run view <run-id> --log-failed

# Re-run only failed jobs
gh run rerun <run-id> --failed
```

---

## Common CI/CD Issues

### Issue 1: npm ci Fails on Lock File Mismatch

**Error:**
```
npm ERR! The `npm ci` command can only install with an existing package-lock.json
```

**Cause:** Lock file missing or out of sync with package.json.

**Solution:**
```bash
npm install          # Regenerate lock file
git add package-lock.json
git commit -m "chore: update package-lock.json"
```

### Issue 2: Prisma Generate Fails in CI

**Error:**
```
Error: Could not find Prisma client
```

**Cause:** Prisma client not generated before type-check/test.

**Solution:** Add explicit generate step before type-check:
```yaml
- name: Generate Prisma client
  run: npx prisma generate
```

### Issue 3: Docker Login Fails

**Error:**
```
Error: denied: requested access to the resource is denied
```

**Cause:** Invalid or missing Docker Hub credentials.

**Solution:**
1. Verify secrets are set in GitHub Settings
2. Regenerate Docker Hub access token
3. Update `DOCKER_PASSWORD` secret

### Issue 4: Working Directory Issues

**Error:**
```
npm ERR! Could not read package.json
```

**Cause:** Workflow runs at repo root, but package.json is in `task-manager/`.

**Solution:** Set working directory:
```yaml
defaults:
  run:
    working-directory: task-manager
```

### Issue 5: Cache Miss on First Run

**Cause:** No cache exists yet. First run always builds from scratch.

**Solution:** This is expected. Subsequent runs will be faster.

---

## What You've Learned in Phase 3

### Technologies Mastered:
- ✅ GitHub Actions workflow syntax
- ✅ CI/CD pipeline design
- ✅ Automated quality gates
- ✅ Docker image building in CI
- ✅ Docker Hub registry integration
- ✅ Security scanning (npm audit, Trivy)
- ✅ GitHub Secrets management

### Core Concepts:
- ✅ Event-driven automation (push, PR triggers)
- ✅ Job dependencies and parallel execution
- ✅ Caching strategies for faster builds
- ✅ Image tagging for traceability
- ✅ Security scanning integration
- ✅ Branch protection patterns
- ✅ Working directory configuration

### Best Practices:
- ✅ Fastest checks first (lint → type-check → test)
- ✅ Parallel independent jobs
- ✅ Build caching (npm packages + Docker layers)
- ✅ Secrets management (never hardcoded)
- ✅ Conditional job execution (Docker only on main)
- ✅ Proper image tagging (SHA + latest)
- ✅ Fail-fast with appropriate severity levels

---

## Kubernetes Fundamentals

### What is Kubernetes?

Kubernetes (K8s) is a container orchestration platform that automates deployment, scaling, and management of containerized applications. While Docker runs individual containers, Kubernetes manages hundreds of containers across multiple machines.

### Key Concepts

**1. Pods**: The smallest deployable unit in Kubernetes. A pod runs one or more containers that share storage and network.

```yaml
# A pod running your task-manager container
apiVersion: v1
kind: Pod
metadata:
  name: task-manager
spec:
  containers:
    - name: task-manager
      image: ralf090102/task-manager-app:latest
      ports:
        - containerPort: 3000
```

**2. Deployments**: Manage replica sets of pods. Ensures the desired number of pods are always running, handles rolling updates and rollbacks.

**3. Services**: Provide stable networking for pods. Since pods can be created and destroyed, Services give them a fixed IP and DNS name.

**4. Ingress**: Exposes HTTP routes from outside the cluster to Services. Acts as an entry point with host-based routing.

**5. Secrets**: Store sensitive data (passwords, API keys) separately from pod definitions.

**6. Namespaces**: Virtual clusters within a physical cluster. Isolate resources (e.g., `task-manager` namespace).

### Why Kubernetes Over Docker Compose?

| Docker Compose | Kubernetes |
|----------------|------------|
| Single machine | Multiple machines (cluster) |
| Manual scaling | Auto-scaling |
| No self-healing | Auto-restarts failed pods |
| Basic networking | Advanced service mesh |
| Manual rollouts | Rolling updates & rollbacks |
| Development tool | Production orchestration |

---

## Helm Chart Development

### What is Helm?

Helm is the package manager for Kubernetes. A Helm chart is a collection of templates and values that define a complete application deployment. Think of it as "Docker Compose for Kubernetes" — but templated and versioned.

### Chart Structure

```
task-manager/helm-chart/
├── Chart.yaml          # Chart metadata (name, version)
├── values.yaml         # Default configuration values
└── templates/
    ├── _helpers.tpl    # Reusable template helpers
    ├── deployment.yaml # Pod deployment spec
    ├── service.yaml    # ClusterIP service
    ├── ingress.yaml    # NGINX ingress routing
    └── secret.yaml     # Opaque secrets (base64-encoded)
```

### Chart.yaml — Chart Metadata

```yaml
# task-manager/helm-chart/Chart.yaml
apiVersion: v2
name: task-manager
description: Task Manager Web Application
type: application
version: 1.0.0          # Chart version (changes when you modify templates)
appVersion: "1.0.0"     # Application version
```

**Key fields:**
- `apiVersion: v2` — Helm 3 chart format
- `version` — The chart version, incremented when templates change
- `appVersion` — The version of the application being deployed

### values.yaml — Default Configuration

```yaml
# task-manager/helm-chart/values.yaml
replicaCount: 1

image:
  repository: ralf090102/task-manager-app
  pullPolicy: IfNotPresent
  tag: latest

service:
  type: ClusterIP
  port: 3000

ingress:
  enabled: true
  className: nginx
  hosts:
    - host: task-manager.local
      paths:
        - path: /
          pathType: Prefix

secrets:
  databaseUrl: ""
  nextauthSecret: ""
  nextauthUrl: "http://task-manager.local"
  authTrustHost: "true"

resources:
  limits:
    cpu: 500m
    memory: 512Mi
  requests:
    cpu: 250m
    memory: 256Mi
```

**Overriding values at install time:**
```bash
helm install task-manager ./helm-chart \
  --set secrets.databaseUrl="postgresql://..." \
  --set secrets.nextauthSecret="my-secret" \
  --set image.pullPolicy=Never
```

### _helpers.tpl — Reusable Template Helpers

```yaml
# task-manager/helm-chart/templates/_helpers.tpl

{{- define "task-manager.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "task-manager.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- .Chart.Name }}
{{- end }}
{{- end }}

{{- define "task-manager.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
app.kubernetes.io/name: {{ include "task-manager.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "task-manager.selectorLabels" -}}
app.kubernetes.io/name: {{ include "task-manager.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
```

**What these do:**
- `task-manager.name` — Returns the chart name, truncated to 63 chars (K8s name limit)
- `task-manager.fullname` — Returns the full resource name
- `task-manager.labels` — Standard Kubernetes labels for resource tracking
- `task-manager.selectorLabels` — Labels used to match pods to services/deployments

### Deployment Template

```yaml
# task-manager/helm-chart/templates/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "task-manager.fullname" . }}
  labels:
    {{- include "task-manager.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      {{- include "task-manager.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "task-manager.selectorLabels" . | nindent 8 }}
    spec:
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - name: http
              containerPort: 3000
              protocol: TCP
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: {{ include "task-manager.fullname" . }}-secrets
                  key: database-url
            - name: NEXTAUTH_SECRET
              valueFrom:
                secretKeyRef:
                  name: {{ include "task-manager.fullname" . }}-secrets
                  key: nextauth-secret
            - name: NEXTAUTH_URL
              valueFrom:
                secretKeyRef:
                  name: {{ include "task-manager.fullname" . }}-secrets
                  key: nextauth-url
            - name: AUTH_TRUST_HOST
              valueFrom:
                secretKeyRef:
                  name: {{ include "task-manager.fullname" . }}-secrets
                  key: auth-trust-host
          livenessProbe:
            httpGet:
              path: /
              port: http
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /
              port: http
            initialDelaySeconds: 5
            periodSeconds: 5
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
```

**Key sections:**
- `replicas` — How many pod copies to run (from `values.yaml`)
- `image` — Container image reference using template variables
- `env` — Environment variables pulled from the Secret resource
- `livenessProbe` — Restarts the pod if it becomes unresponsive (checks after 30s, every 10s)
- `readinessProbe` — Removes pod from Service load balancer if not ready (checks after 5s, every 5s)
- `resources` — CPU/memory limits and requests to prevent resource starvation

### Service Template

```yaml
# task-manager/helm-chart/templates/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: {{ include "task-manager.fullname" . }}
  labels:
    {{- include "task-manager.labels" . | nindent 4 }}
spec:
  type: {{ .Values.service.type }}
  ports:
    - port: {{ .Values.service.port }}
      targetPort: http
      protocol: TCP
      name: http
  selector:
    {{- include "task-manager.selectorLabels" . | nindent 4 }}
```

**How it works:**
- `type: ClusterIP` — Internal cluster IP only (not exposed to internet)
- `port: 3000` — Service port
- `targetPort: http` — Maps to the named container port in the Deployment
- `selector` — Routes traffic to pods matching these labels

### Ingress Template

```yaml
# task-manager/helm-chart/templates/ingress.yaml
{{- if .Values.ingress.enabled -}}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ include "task-manager.fullname" . }}
  labels:
    {{- include "task-manager.labels" . | nindent 4 }}
spec:
  ingressClassName: {{ .Values.ingress.className }}
  rules:
    {{- range .Values.ingress.hosts }}
    - host: {{ .host | quote }}
      http:
        paths:
          {{- range .paths }}
          - path: {{ .path }}
            pathType: {{ .pathType }}
            backend:
              service:
                name: {{ include "task-manager.fullname" $ }}
                port:
                  number: {{ $.Values.service.port }}
          {{- end }}
    {{- end }}
{{- end }}
```

**How it works:**
- `ingressClassName: nginx` — Uses the NGINX Ingress Controller
- `host: task-manager.local` — Routes requests for this domain
- `path: /` with `Prefix` — Matches all paths under `/`
- `backend` — Forwards to the Service on port 3000
- Conditional rendering: only created when `ingress.enabled: true`

### Secret Template

```yaml
# task-manager/helm-chart/templates/secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: {{ include "task-manager.fullname" . }}-secrets
  labels:
    {{- include "task-manager.labels" . | nindent 4 }}
type: Opaque
data:
  database-url: {{ .Values.secrets.databaseUrl | b64enc | quote }}
  nextauth-secret: {{ .Values.secrets.nextauthSecret | b64enc | quote }}
  nextauth-url: {{ .Values.secrets.nextauthUrl | b64enc | quote }}
  auth-trust-host: {{ .Values.secrets.authTrustHost | b64enc | quote }}
```

**Important:**
- `type: Opaque` — Generic secret type for arbitrary key-value pairs
- `b64enc` — Helm pipe function that base64-encodes values (K8s Secrets require base64)
- Values are passed via `--set` at install time and never stored in the chart

---

## Minikube for Local Development

### What is Minikube?

Minikube is a tool that runs a single-node Kubernetes cluster on your local machine. It's perfect for learning and testing Kubernetes deployments without needing a cloud provider.

### Setup Commands

```bash
# Start Minikube with Docker driver
minikube start --driver=docker

# Enable NGINX Ingress controller (required for Ingress resources)
minikube addons enable ingress

# Check Minikube status
minikube status

# Get Minikube IP (internal cluster IP)
minikube ip

# Stop Minikube (preserves cluster state)
minikube stop

# Delete cluster entirely
minikube delete
```

### Building Images for Minikube

Minikube runs its own Docker daemon. Your local Docker images are NOT visible inside Minikube. You have two options:

**Option 1: Build directly inside Minikube (recommended)**
```bash
minikube image build -t ralf090102/task-manager-app:latest -f Dockerfile D:\GitHub\Task-Manager-Web-Application\task-manager
```

**Option 2: Load a pre-built image**
```bash
# Build with local Docker first
docker build -t ralf090102/task-manager-app:latest ./task-manager

# Load into Minikube
minikube image load ralf090102/task-manager-app:latest
```

When using either option, set `image.pullPolicy: Never` so Kubernetes uses the local image instead of trying to pull from Docker Hub.

### minikube tunnel

On Windows with Docker driver, the Minikube internal IP (e.g., `192.168.49.2`) is NOT directly reachable from the host. `minikube tunnel` creates a network route that maps Ingress resources to `127.0.0.1`:

```bash
# Run in a separate terminal (blocks foreground)
minikube tunnel

# Then access via hosts file entry: 127.0.0.1 task-manager.local
```

The tunnel must stay running for the app to be accessible. If you close it, the app becomes unreachable until you restart it.

---

## Deploying with Helm

### Full Deployment Workflow

```bash
# 1. Start Minikube
minikube start --driver=docker

# 2. Enable NGINX Ingress controller
minikube addons enable ingress

# 3. Build image inside Minikube
minikube image build -t ralf090102/task-manager-app:latest -f Dockerfile D:\GitHub\Task-Manager-Web-Application\task-manager

# 4. Install the Helm chart
helm install task-manager ./task-manager/helm-chart \
  --namespace task-manager \
  --create-namespace \
  --set secrets.databaseUrl="postgresql://postgres:postgres@host.docker.internal:5432/taskmanager" \
  --set secrets.nextauthSecret="local-dev-secret-change-in-production" \
  --set secrets.nextauthUrl="http://task-manager.local" \
  --set image.pullPolicy=Never

# 5. Verify deployment
kubectl get pods -n task-manager
kubectl get ingress -n task-manager

# 6. Add hosts file entry (requires admin)
# Add to C:\Windows\System32\drivers\etc\hosts:
#   127.0.0.1 task-manager.local

# 7. Start tunnel (in separate terminal)
minikube tunnel

# 8. Access the app
# Open http://task-manager.local in browser
```

### Updating the Deployment

```bash
# After making code changes:

# 1. Rebuild the image
minikube image build -t ralf090102/task-manager-app:latest -f Dockerfile D:\GitHub\Task-Manager-Web-Application\task-manager

# 2. Restart the deployment to pick up new image
kubectl rollout restart deployment/task-manager -n task-manager

# Or upgrade with Helm (if values changed)
helm upgrade task-manager ./task-manager/helm-chart --namespace task-manager --reuse-values
```

### Useful kubectl Commands

```bash
# View all resources
kubectl get all -n task-manager

# View pods with wide output
kubectl get pods -n task-manager -o wide

# View pod details and events
kubectl describe pod <pod-name> -n task-manager

# View application logs
kubectl logs -n task-manager deployment/task-manager --tail=20
kubectl logs -n task-manager deployment/task-manager -f    # Follow/stream

# View secrets (base64 encoded)
kubectl get secrets -n task-manager
kubectl describe secret task-manager-secrets -n task-manager

# View ingress details
kubectl describe ingress -n task-manager

# Port-forward for direct pod access (bypasses Ingress)
kubectl port-forward -n task-manager deployment/task-manager 3000:3000
# Then access http://localhost:3000

# Delete and recreate a pod
kubectl delete pod <pod-name> -n task-manager

# Scale replicas
kubectl scale deployment task-manager --replicas=3 -n task-manager
```

---

## Health Checks and Probes

### Kubernetes Probe Types

Your deployment defines two probe types:

**Liveness Probe** — Is the app running?
```yaml
livenessProbe:
  httpGet:
    path: /
    port: http
  initialDelaySeconds: 30    # Wait 30s before first check
  periodSeconds: 10           # Check every 10s
```
If the liveness probe fails, Kubernetes **kills and restarts** the pod. The 30s delay gives Next.js time to start.

**Readiness Probe** — Is the app ready to serve traffic?
```yaml
readinessProbe:
  httpGet:
    path: /
    port: http
  initialDelaySeconds: 5     # Wait 5s before first check
  periodSeconds: 5            # Check every 5s
```
If the readiness probe fails, Kubernetes **removes the pod from the Service** (stops sending traffic) but does NOT restart it.

### Why Two Probes?

- **Readiness**: App is starting but not ready yet → stop traffic, don't restart
- **Liveness**: App is completely stuck/crashed → restart it

This prevents unnecessary restarts during normal startup while still recovering from real failures.

---

## Resource Limits

### Why Limit Resources?

In a shared Kubernetes cluster, pods compete for CPU and memory. Without limits, one pod could consume all resources and starve others.

### Your Configuration

```yaml
resources:
  limits:
    cpu: 500m        # Max 0.5 CPU cores
    memory: 512Mi    # Max 512 MB RAM
  requests:
    cpu: 250m        # Guaranteed 0.25 CPU cores
    memory: 256Mi    # Guaranteed 256 MB RAM
```

**Requests vs Limits:**
- `requests` — What Kubernetes guarantees. Used for scheduling decisions.
- `limits` — Maximum the container can use. Exceeded → CPU is throttled, memory causes OOM kill.

**Units:**
- `500m` = 500 millicores = 0.5 CPU cores
- `512Mi` = 512 mebibytes (~537 MB)

---

## Kubernetes Networking Flow

### How Traffic Reaches Your App

```
Browser
  → http://task-manager.local
    → Hosts file: 127.0.0.1
      → minikube tunnel (routes to cluster)
        → NGINX Ingress Controller
          → Rule: host=task-manager.local, path=/
            → Service: task-manager (ClusterIP:3000)
              → Pod: task-manager-xxx (port 3000)
                → Next.js app
```

### Component Roles

| Component | Role |
|-----------|------|
| **Hosts file** | Maps `task-manager.local` to `127.0.0.1` |
| **minikube tunnel** | Routes `127.0.0.1` traffic into the Minikube cluster |
| **Ingress** | Routes HTTP traffic by host/path to the correct Service |
| **Service** | Stable IP/DNS that load-balances across Pods |
| **Pod** | Runs the actual container (your Next.js app) |

---

## Troubleshooting Kubernetes Deployment

### Issue 1: minikube image build Cannot Find Dockerfile

**Error:**
```
ERROR: failed to build: failed to solve: failed to read dockerfile: open Dockerfile: no such file or directory
```

**Cause:** The `minikube image build` command needs the build context directory AND the Dockerfile to be specified correctly. Running from the wrong directory or without specifying the Dockerfile path fails.

**Solution:**
```bash
# WRONG — running from repo root without context:
minikube image build -t ralf090102/task-manager-app:latest ./task-manager

# WRONG — running from task-manager dir without -f flag:
minikube image build -t ralf090102/task-manager-app:latest .

# CORRECT — specify both -f Dockerfile AND the build context path:
minikube image build -t ralf090102/task-manager-app:latest -f Dockerfile D:\GitHub\Task-Manager-Web-Application\task-manager
```

**Lesson:** `minikube image build` needs the Dockerfile path (`-f`) AND the build context directory as the last argument. These are two separate parameters.

---

### Issue 2: Hosts File Requires Admin Privileges

**Error:**
```
Access is denied.
```

**Cause:** The Windows hosts file (`C:\Windows\System32\drivers\etc\hosts`) is a protected system file. Modifying it requires elevated (administrator) privileges.

**Solution:**
```powershell
# Use Start-Process with -Verb RunAs to elevate:
Start-Process powershell -Verb RunAs -ArgumentList '-Command', 'Add-Content -Path C:\Windows\System32\drivers\etc\hosts -Value "127.0.0.1 task-manager.local"'
```

Or manually:
1. Open Notepad as Administrator (right-click → Run as administrator)
2. File → Open → `C:\Windows\System32\drivers\etc\hosts`
3. Add `127.0.0.1 task-manager.local` at the bottom
4. Save

**Verify:**
```powershell
Get-Content C:\Windows\System32\drivers\etc\hosts | Select-String "task-manager"
```

---

### Issue 3: App Unreachable at Minikube Internal IP (192.168.49.2)

**Error:**
```
Invoke-WebRequest : The operation has timed out.
```

**Cause:** On Windows with the Docker driver, Minikube's internal IP (`192.168.49.2`) is NOT directly reachable from the host. This is a known limitation — the Docker VM network is isolated from the Windows host.

**Solution:** Use `minikube tunnel` instead of the internal IP:

```powershell
# Start tunnel in a background window
Start-Process powershell -ArgumentList '-Command', 'minikube tunnel'

# Update hosts file to use 127.0.0.1 (where tunnel routes traffic)
Start-Process powershell -Verb RunAs -ArgumentList '-Command', '(Get-Content C:\Windows\System32\drivers\etc\hosts) -replace ''192.168.49.2 task-manager.local'', ''127.0.0.1 task-manager.local'' | Set-Content C:\Windows\System32\drivers\etc\hosts'
```

**Lesson:** On Linux, `minikube ip` returns a reachable address. On Windows/macOS with Docker driver, you MUST use `minikube tunnel` to access Ingress resources. The tunnel maps the Ingress load balancer to `127.0.0.1`.

---

### Issue 4: Pod Stuck in ImagePullBackOff

**Error:**
```
NAME                            READY   STATUS             RESTARTS   AGE
task-manager-xxx                0/1     ImagePullBackOff   0          30s
```

**Cause:** Kubernetes is trying to pull the image from Docker Hub, but either the image doesn't exist there, or you want to use the locally-built Minikube image.

**Solution:**
```bash
# Option 1: Set pullPolicy to Never at install time
helm install task-manager ./helm-chart --set image.pullPolicy=Never ...

# Option 2: Update values.yaml
image:
  pullPolicy: Never    # Use local image, never pull

# Then verify the image exists in Minikube:
minikube image ls | grep task-manager
```

**Lesson:** `image.pullPolicy: Never` tells Kubernetes to only use images that already exist on the node. This is essential for local Minikube development where you build images directly inside Minikube's Docker daemon.

---

### Issue 5: Pod Crashes with Database Connection Error

**Error (in pod logs):**
```
Can't reach database server at `localhost:5432`
```

**Cause:** The DATABASE_URL is pointing to `localhost` inside the container, but the database isn't running in the same pod. For Supabase, use the external connection URL.

**Solution:**
```bash
# Use the correct Supabase connection string:
helm install task-manager ./helm-chart \
  --set secrets.databaseUrl="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"

# Or for Docker Compose PostgreSQL:
# Use host.docker.internal to reach host from container
--set secrets.databaseUrl="postgresql://postgres:postgres@host.docker.internal:5432/taskmanager"
```

**Lesson:** `localhost` inside a Kubernetes pod refers to the pod itself, NOT the host machine. Use the external database URL or `host.docker.internal` to reach services outside the cluster.

---

### Issue 6: Helm Release Name Conflicts

**Error:**
```
Error: INSTALLATION FAILED: cannot re-use a name that is still in use
```

**Cause:** A Helm release with the same name already exists in the namespace.

**Solution:**
```bash
# Check existing releases:
helm list -n task-manager

# Option 1: Upgrade the existing release
helm upgrade task-manager ./helm-chart --namespace task-manager --reuse-values

# Option 2: Uninstall first, then reinstall
helm uninstall task-manager --namespace task-manager
helm install task-manager ./helm-chart --namespace task-manager ...

# Option 3: Use a different release name
helm install task-manager-v2 ./helm-chart --namespace task-manager ...
```

---

## What You've Learned in Phase 4

### Technologies Mastered:
- ✅ Kubernetes core concepts (Pods, Deployments, Services, Ingress, Secrets)
- ✅ Helm chart development and templating
- ✅ Minikube for local Kubernetes development
- ✅ NGINX Ingress Controller setup
- ✅ kubectl CLI for cluster management
- ✅ Container probes (liveness and readiness)
- ✅ Resource limits and requests

### Core Concepts:
- ✅ Container orchestration vs single-container deployment
- ✅ Declarative infrastructure with YAML templates
- ✅ Service discovery and load balancing
- ✅ Secret management with Kubernetes Secrets
- ✅ Health checking and self-healing
- ✅ Network routing from browser to pod
- ✅ Helm values and template rendering

### Best Practices:
- ✅ Resource limits to prevent resource starvation
- ✅ Both liveness and readiness probes
- ✅ Base64-encoded Secrets (never plaintext in templates)
- ✅ `image.pullPolicy: Never` for local Minikube dev
- ✅ Standard Kubernetes labels for resource tracking
- ✅ Reusable template helpers in `_helpers.tpl`
- ✅ Separate namespaces for application isolation

### Troubleshooting Skills:
- ✅ Diagnosing Minikube networking issues (tunnel vs internal IP)
- ✅ Fixing ImagePullBackOff with pullPolicy configuration
- ✅ Building images inside Minikube's Docker daemon
- ✅ Debugging with `kubectl logs`, `kubectl describe`, `kubectl get`
- ✅ Managing Helm releases (install, upgrade, uninstall)
- ✅ Windows-specific issues (hosts file permissions, Docker network isolation)

---

## Next Steps: Phase 5

In Phase 5, you'll learn:
- Monitoring with Prometheus and Grafana
- Log aggregation
- Alerting rules and notification channels
- Application performance monitoring

This will give you visibility into your application's health and performance in production.

---

## What is Observability?

### Monitoring vs Observability

**Monitoring** tells you *when* something is wrong. **Observability** tells you *why*.

Observability has three pillars:

| Pillar | What | Tool in This Project |
|--------|------|---------------------|
| **Metrics** | Numeric data over time (CPU, request count, latency) | Prometheus + prom-client |
| **Logs** | Discrete events with context (who did what, when) | pino (structured JSON) |
| **Traces** | Request flow across services (not implemented here) | Jaeger / OpenTelemetry |

### The Metrics Pipeline

```
Your App (prom-client)
  → /api/metrics endpoint (Prometheus text format)
    → ServiceMonitor (tells Prometheus to scrape)
      → Prometheus (stores time-series data)
        → Grafana (queries Prometheus, renders dashboards)
```

**How it works step by step:**
1. `prom-client` maintains in-memory counters and histograms in your Node.js process
2. When Prometheus scrapes `/api/metrics`, prom-client outputs all metrics in text format
3. Prometheus stores each scrape as a time-series data point
4. Grafana queries Prometheus using PromQL and renders charts

---

## Prometheus Metrics Collection

### What is Prometheus?

Prometheus is a time-series database that collects metrics by **pulling** (scraping) HTTP endpoints. It does NOT receive pushed data (unlike many logging systems).

### kube-prometheus-stack

Instead of installing Prometheus, Grafana, and Alertmanager separately, we use the `kube-prometheus-stack` Helm chart — it bundles all three plus the Prometheus Operator (which manages ServiceMonitor resources).

```bash
# Install the monitoring stack
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
helm install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace \
  --set grafana.adminPassword=admin
```

### Components Installed

| Component | Purpose | Pods |
|-----------|---------|------|
| **Prometheus** | Scrapes and stores metrics | `prometheus-monitoring-*` |
| **Grafana** | Visualization dashboards | `monitoring-grafana-*` |
| **Alertmanager** | Routes alerts to notifications | `alertmanager-monitoring-*` |
| **node-exporter** | Host-level CPU/memory/disk metrics | `monitoring-prometheus-node-exporter-*` |
| **kube-state-metrics** | Kubernetes object state metrics | `monitoring-kube-state-metrics-*` |
| **Prometheus Operator** | Manages Prometheus config via CRDs | `monitoring-kube-prometheus-operator-*` |

### Accessing Prometheus and Grafana

On Windows with Docker driver, Minikube's internal IPs are unreachable (see Issue 3 in Troubleshooting Kubernetes Deployment). Use `kubectl port-forward`:

```bash
# Grafana UI (admin/admin)
kubectl port-forward -n monitoring svc/monitoring-grafana 3001:80
# Open http://localhost:3001

# Prometheus UI
kubectl port-forward -n monitoring svc/monitoring-kube-prometheus-prometheus 9090:9090
# Open http://localhost:9090
```

**Why port-forward and not Ingress?** Port-forward creates a direct tunnel to a specific pod. It's simpler than creating separate Ingress routes for each monitoring tool, and sufficient for local development.

### Prometheus UI

The Prometheus web UI lets you:
- **Targets** (`Status > Targets`): See what Prometheus is scraping and their health
- **Query** (`/graph`): Run PromQL queries interactively
- **Alerts** (`/alerts`): View firing alerts

**Example PromQL queries:**
```promql
# Request rate (requests per second over last 5 min)
rate(http_request_duration_seconds_count[5m])

# 99th percentile latency
histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))

# Total task operations by type
sum(task_operations_total) by (operation)
```

---

## Application Metrics with prom-client

### What is prom-client?

`prom-client` is the official Node.js client library for Prometheus. It provides:
- **Counter**: A value that only goes up (e.g., total requests)
- **Histogram**: Distribution of values across buckets (e.g., request latency)
- **Gauge**: A value that goes up and down (e.g., active connections)
- **Default metrics**: Automatic Node.js process metrics (CPU, memory, GC, event loop)

### Metrics Library

```typescript
// src/lib/metrics.ts
import { register, Counter, Histogram, collectDefaultMetrics } from "prom-client";

// Collect Node.js default metrics (CPU, memory, GC, event loop)
collectDefaultMetrics({ register });

// HTTP request duration histogram
export const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
});

// Task operations counter
export const taskOperations = new Counter({
  name: "task_operations_total",
  help: "Total number of task operations",
  labelNames: ["operation", "status"],
});

// Helper functions
export function observeRequest(
  method: string,
  route: string,
  statusCode: number,
  durationSeconds: number
) {
  httpRequestDuration
    .labels(method, route, String(statusCode))
    .observe(durationSeconds);
}

export function trackTaskOperation(operation: string, status: string) {
  taskOperations.labels(operation, status).inc();
}

export { register };
```

**Key concepts:**
- `collectDefaultMetrics`: Automatically tracks `process_cpu_seconds_total`, `process_resident_memory_bytes`, `nodejs_eventloop_lag`, etc.
- `Histogram` buckets define latency ranges: `[0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10]` seconds
- Labels allow filtering: `http_request_duration_seconds_count{method="GET",route="/api/tasks"}`
- `register` holds all metrics and outputs them in Prometheus text format

### Metrics Endpoint

```typescript
// src/app/api/metrics/route.ts
import { NextResponse } from "next/server";
import { register } from "@/lib/metrics";

export async function GET() {
  const metrics = await register.metrics();
  return new NextResponse(metrics, {
    headers: { "Content-Type": register.contentType },
  });
}
```

This endpoint returns metrics in Prometheus text format:

```
# HELP http_request_duration_seconds Duration of HTTP requests in seconds
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{method="GET",route="/api/tasks",status_code="200",le="0.05"} 3
http_request_duration_seconds_bucket{method="GET",route="/api/tasks",status_code="200",le="0.1"} 5
http_request_duration_seconds_bucket{method="GET",route="/api/tasks",status_code="200",le="+Inf"} 5
http_request_duration_seconds_count{method="GET",route="/api/tasks",status_code="200"} 5
http_request_duration_seconds_sum{method="GET",route="/api/tasks",status_code="200"} 0.234

# HELP task_operations_total Total number of task operations
# TYPE task_operations_total counter
task_operations_total{operation="create",status="success"} 2
task_operations_total{operation="delete",status="success"} 1
```

### Integrating Metrics into API Routes

Each API handler tracks timing and operation outcomes:

```typescript
// src/app/api/tasks/route.ts (POST handler)
export async function POST(req: Request) {
  const start = Date.now();  // Start timer
  try {
    const session = await auth();
    if (!session?.user?.id) {
      observeRequest("POST", "/api/tasks", 401, (Date.now() - start) / 1000);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // ... validation and creation ...
    trackTaskOperation("create", "success");
    observeRequest("POST", "/api/tasks", 201, (Date.now() - start) / 1000);
    return NextResponse.json(task, { status: 201 });
  } catch (err) {
    trackTaskOperation("create", "error");
    observeRequest("POST", "/api/tasks", 500, (Date.now() - start) / 1000);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

**Pattern:** Every code path (success, validation error, auth failure, server error) records the duration and outcome. This gives complete visibility into API performance.

---

## ServiceMonitor Configuration

### What is a ServiceMonitor?

A ServiceMonitor is a Custom Resource Definition (CRD) from the Prometheus Operator. It tells Prometheus: "Scrape the pods behind this Kubernetes Service at path X every Y seconds."

Without a ServiceMonitor, Prometheus only scrapes infrastructure components (kubelet, node-exporter, etc.) but NOT your application.

### ServiceMonitor Template

```yaml
# task-manager/helm-chart/templates/servicemonitor.yaml
{{- if .Values.monitoring.enabled -}}
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: {{ include "task-manager.fullname" . }}
  labels:
    {{- include "task-manager.labels" . | nindent 4 }}
    {{- with .Values.monitoring.serviceMonitor.labels }}
    {{- toYaml . | nindent 4 }}
    {{- end }}
spec:
  selector:
    matchLabels:
      {{- include "task-manager.selectorLabels" . | nindent 6 }}
  endpoints:
    - port: http
      path: /api/metrics
      interval: {{ .Values.monitoring.serviceMonitor.scrapeInterval }}
{{- end }}
```

### Values Configuration

```yaml
# task-manager/helm-chart/values.yaml (added section)
monitoring:
  enabled: true
  serviceMonitor:
    scrapeInterval: 15s
    labels:
      release: monitoring
```

### The `release: monitoring` Label — Critical!

The Prometheus Operator only picks up ServiceMonitors that match its configured label selector. The `kube-prometheus-stack` chart uses `release: <release-name>` as the selector. Since we installed with `helm install monitoring ...`, the selector label is `release: monitoring`.

**Without this label, Prometheus will NOT scrape your app.** The ServiceMonitor exists but is invisible to Prometheus.

### How Prometheus Discovers Targets

1. Prometheus Operator watches for ServiceMonitor resources with matching labels
2. For each ServiceMonitor, it reads the `selector` to find the Kubernetes Service
3. It finds the pods behind that Service via endpoint discovery
4. It scrapes each pod at the configured `path` and `port` every `interval`

```
ServiceMonitor (label: release=monitoring)
  → selects Service (labels: app=task-manager)
    → finds Pods (via endpoints)
      → scrapes http://<pod-ip>:3000/api/metrics every 15s
```

---

## Grafana Dashboards

### Accessing Grafana

```bash
kubectl port-forward -n monitoring svc/monitoring-grafana 3001:80
# Open http://localhost:3001, login: admin/admin
```

### Using Grafana Explore

Grafana's Explore feature lets you run PromQL queries without building a dashboard:

1. Click the compass icon (Explore) in the left sidebar
2. Select "Prometheus" as the data source
3. Enter a PromQL query and run it

**Useful queries to try:**

```promql
# All HTTP requests in the last 5 minutes
rate(http_request_duration_seconds_count[5m])

# Request duration p99 (slowest 1% of requests)
histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))

# Task operations by type
sum(task_operations_total) by (operation)

# Pod memory usage
container_memory_working_set_bytes{namespace="task-manager"}

# Node CPU usage
rate(node_cpu_seconds_total{mode!="idle"}[5m])
```

### Pre-built Dashboards

The `kube-prometheus-stack` includes several pre-built dashboards accessible from Dashboards > Browse:
- **Node Exporter / Nodes**: Host CPU, memory, disk, network
- **Kubernetes / Compute Resources / Cluster**: Cluster-wide resource usage
- **Kubernetes / API Server**: Kubernetes API server performance
- **Prometheus / Overview**: Prometheus self-monitoring

---

## Structured Logging with pino

### Why Structured Logging?

**Unstructured (bad):**
```
console.log("User " + userId + " created task " + taskId);
```
Hard to search, filter, or parse programmatically.

**Structured (good):**
```typescript
logger.info({ userId, taskId }, "Task created");
```
Outputs JSON:
```json
{"level":"info","time":"2026-06-13T21:30:00.000Z","userId":"abc123","taskId":"def456","msg":"Task created"}
```
Easy to search by field, pipe to log aggregation systems (ELK, Loki, Datadog).

### pino Logger Configuration

```typescript
// src/lib/logger.ts
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  formatters: {
    level(label) {
      return { level: label };  // Use string labels ("info") instead of numbers (30)
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,  // ISO 8601 timestamps
});

export default logger;
```

**Configuration options:**
- `level`: Minimum log level (`fatal`, `error`, `warn`, `info`, `debug`, `trace`)
- `formatters.level`: Outputs `"level": "info"` instead of `"level": 30`
- `timestamp`: ISO 8601 format (`"2026-06-13T21:30:00.000Z"`)

### Logging in API Routes

```typescript
// Success logging
logger.info({ taskId: task.id, userId: session.user.id }, "Task created");

// Error logging with stack trace
logger.error({ err }, "Failed to create task");
```

**Best practices:**
- First argument: JSON object with contextual data (IDs, user info)
- Second argument: Human-readable message
- Never log secrets (passwords, tokens, session data)
- Use `logger.error` for caught exceptions, `logger.warn` for degraded behavior, `logger.info` for normal operations
- Avoid `logger.debug` in production (set `LOG_LEVEL=info`)

### Viewing Logs in Kubernetes

```bash
# View application logs (includes pino JSON output)
kubectl logs -n task-manager deployment/task-manager --tail=50

# Follow logs in real-time
kubectl logs -n task-manager deployment/task-manager -f

# Search for errors
kubectl logs -n task-manager deployment/task-manager | grep '"level":"error"'
```

---

## Troubleshooting Monitoring Setup

### Issue 1: Prometheus Target Shows "down" with 404

**Error (in Prometheus > Status > Targets):**
```
lastError: server returned HTTP status 404 Not Found
health: down
```

**Cause:** The ServiceMonitor points to `/metrics` but the Next.js metrics route is at `/api/metrics`.

**Solution:** Update the ServiceMonitor path:
```yaml
endpoints:
  - port: http
    path: /api/metrics    # NOT /metrics
    interval: 15s
```

**Lesson:** In Next.js App Router, API routes are under `/api/`. The Prometheus convention is `/metrics`, but the actual route path depends on your framework.

---

### Issue 2: Helm Upgrade Fails with "nil pointer evaluating interface {}.enabled"

**Error:**
```
Error: UPGRADE FAILED: task-manager/templates/servicemonitor.yaml:1:14
  nil pointer evaluating interface {}.enabled
```

**Cause:** `--reuse-values` reuses values from the previous release, which didn't have the `monitoring` section. The template tries to access `.Values.monitoring.enabled` on a nil value.

**Solution:** Pass the new keys explicitly alongside `--reuse-values`:
```bash
helm upgrade task-manager ./helm-chart --namespace task-manager \
  --reuse-values \
  --set monitoring.enabled=true \
  --set monitoring.serviceMonitor.scrapeInterval=15s \
  --set monitoring.serviceMonitor.labels.release=monitoring
```

**Lesson:** `--reuse-values` does NOT merge in new keys from an updated `values.yaml`. It only reuses the values from the previous release. New keys must be passed via `--set` or `--values`.

---

### Issue 3: Prometheus Not Picking Up ServiceMonitor (Target Missing)

**Symptom:** No task-manager target appears in Prometheus > Status > Targets.

**Cause:** The ServiceMonitor is missing the `release: monitoring` label that the Prometheus Operator uses for discovery.

**Solution:** Add the label to the ServiceMonitor:
```yaml
metadata:
  labels:
    release: monitoring    # Must match your Prometheus release name
```

Or via Helm values:
```yaml
monitoring:
  serviceMonitor:
    labels:
      release: monitoring
```

**Verification:**
```bash
# Check ServiceMonitor labels
kubectl get servicemonitor task-manager -n task-manager -o jsonpath='{.metadata.labels.release}'
# Should output: monitoring
```

---

### Issue 4: Port-Forward Connection Refused

**Error:**
```
Unable to connect to the remote server
```

**Cause:** The port-forward process was killed or the pod restarted.

**Solution:** Restart the port-forward. Also verify the service exists:
```bash
# Check services exist
kubectl get svc -n monitoring

# Re-establish port-forward
kubectl port-forward -n monitoring svc/monitoring-grafana 3001:80
```

**Note:** Port-forwards are ephemeral. They die when the terminal closes or the pod restarts. For persistent access, use Ingress (but that requires separate hostnames or path-based routing).

---

## What You've Learned in Phase 5

### Technologies Mastered:
- ✅ Prometheus metrics collection and PromQL
- ✅ Grafana dashboard visualization
- ✅ prom-client for Node.js metrics
- ✅ ServiceMonitor and Prometheus Operator
- ✅ kube-prometheus-stack Helm chart
- ✅ Structured JSON logging with pino
- ✅ kubectl port-forward for accessing cluster services

### Core Concepts:
- ✅ The three pillars of observability (metrics, logs, traces)
- ✅ Pull-based metrics collection (Prometheus scrapes, doesn't receive pushes)
- ✅ Metric types: Counter, Histogram, Gauge
- ✅ Prometheus Operator and CRD-based configuration
- ✅ Service discovery via labels and selectors
- ✅ Structured logging vs unstructured logging
- ✅ Time-series data and PromQL queries

### Best Practices:
- ✅ Track both timing and outcome for every API request
- ✅ Use labels for filtering (method, route, status_code)
- ✅ Log contextual data as JSON (user IDs, task IDs)
- ✅ Never log secrets or sensitive data
- ✅ Use appropriate log levels (error, warn, info)
- ✅ Default metrics for infrastructure visibility
- ✅ `release: monitoring` label for Prometheus Operator discovery

### Troubleshooting Skills:
- ✅ Diagnosing 404s in Prometheus targets (wrong metrics path)
- ✅ Fixing nil pointer errors in Helm upgrades with --reuse-values
- ✅ Debugging missing Prometheus targets (label selector issues)
- ✅ Using port-forward to access monitoring UIs
- ✅ Querying Prometheus API for target health and metric values

---

## Next Steps: Phase 6

In Phase 6, you'll learn:
- Performance optimization (caching, bundle size, query optimization)
- Security hardening (CSP headers, rate limiting, OWASP compliance)
- Backup and disaster recovery strategies
- Load testing with k6
- Production readiness checklist

This will prepare your application for real-world production deployment.

---

## Resources for Further Learning

### Docker
- [Docker Documentation](https://docs.docker.com/)
- [Dockerfile Best Practices](https://docs.docker.com/develop/develop-images/dockerfile_best-practices/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Docker Multi-Stage Builds](https://docs.docker.com/build/building/multi-stage/)

### Next.js + Docker
- [Next.js Deployment: Docker](https://nextjs.org/docs/app/building-your-application/deploying#docker-image)
- [Next.js Standalone Output](https://nextjs.org/docs/app/building-your-application/configuring/output#automatically-copying-traced-files)

### DevOps
- [Dockerfile Reference](https://docs.docker.com/engine/reference/builder/)
- [Docker Compose File Reference](https://docs.docker.com/compose/compose-file/)
- [BuildKit Documentation](https://github.com/moby/buildkit)

### CI/CD & GitHub Actions
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [GitHub Actions Workflow Syntax](https://docs.github.com/en/actions/reference/workflow-syntax-for-github-actions)
- [Trivy Vulnerability Scanner](https://trivy.dev/)
- [Docker Hub](https://hub.docker.com/)

### Kubernetes & Helm
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Helm Documentation](https://helm.sh/docs/)
- [Minikube Documentation](https://minikube.sigs.k8s.io/docs/)
- [NGINX Ingress Controller](https://kubernetes.github.io/ingress-nginx/)
- [kubectl Cheat Sheet](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)

### Monitoring & Observability
- [Prometheus Documentation](https://prometheus.io/docs/)
- [PromQL Tutorial](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [Grafana Documentation](https://grafana.com/docs/)
- [prom-client (Node.js)](https://github.com/siimon/prom-client)
- [kube-prometheus-stack](https://github.com/prometheus-community/helm-charts/tree/main/charts/kube-prometheus-stack)
- [pino Logger](https://github.com/pinojs/pino)

---

**Remember**: The best way to learn is to build. You've successfully built a fully functional task manager with authentication, containerized it, set up automated CI/CD pipelines, deployed it to Kubernetes, and added comprehensive monitoring and observability. This is a production-ready foundation that demonstrates real-world DevOps skills!
