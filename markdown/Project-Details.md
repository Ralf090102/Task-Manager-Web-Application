# Phase 1 Learning Summary

This document explains the core concepts and technologies implemented in Phase 1 of the Task Manager project. Each section includes real examples from your codebase to help you understand how these concepts work in practice.

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
// src/components/TaskCard.tsx:5-19
interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  createdAt: string;
}

interface TaskCardProps {
  task: Task;
  onStatusChange: (id: string, status: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
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
// src/components/TaskList.tsx:24-26
const [tasks, setTasks] = useState<Task[]>(initialTasks);
const [filter, setFilter] = useState<FilterStatus>("ALL");
const [showForm, setShowForm] = useState(false);  // Toggle form visibility
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
// src/app/(dashboard)/dashboard/page.tsx:7-30
export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const tasks = await prisma.task.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <Navbar />
      <main className="...">
        <TaskList initialTasks={serialized} />
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
// Server component fetches data
const tasks = await prisma.task.findMany(...);
const serialized = tasks.map((t) => ({ ...t, dueDate: t.dueDate?.toISOString() ?? null }));

// Passes to client component
<TaskList initialTasks={serialized} />
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
// src/app/api/tasks/route.ts:27-64
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

    const task = await prisma.task.create({
      data: {
        title: parsed.data.title,
        // ...
      },
    });

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
// prisma/schema.prisma:79-96
model Task {
  id          String       @id @default(cuid())
  title       String
  description String?
  status      TaskStatus   @default(TODO)
  priority    TaskPriority @default(MEDIUM)
  dueDate     DateTime?
  userId      String
  user        User         @relation(fields: [userId], references: [id])

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
  @@index([status])
  @@index([createdAt])
  @@index([dueDate])
}
```

**Key concepts:**
- `@id`: Primary key field
- `@default(cuid())`: Auto-generate unique ID
- `String?`: Optional field
- `@relation`: Defines relationships between models
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
// src/lib/validations.ts:14-20
export const taskCreateSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(1000).optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "COMPLETED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  dueDate: z.string().optional(),
});
```

- `z.enum([...])`: Must be one of the specified values
- `.optional()`: Field is not required

### Validating Input

```tsx
// src/app/api/tasks/route.ts:34-42
const body = await req.json();
const parsed = taskCreateSchema.safeParse(body);

if (!parsed.success) {
  return NextResponse.json(
    { error: "Validation failed", details: parsed.error.issues },
    { status: 400 }
  );
}

const { title, description, status, priority, dueDate } = parsed.data;
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

### 5. Filter Pattern

```tsx
// src/components/TaskList.tsx:78-79
const filteredTasks =
  filter === "ALL" ? tasks : tasks.filter((t) => t.status === filter);
```

Simple conditional filtering based on current filter state.

### 6. Count Pattern

```tsx
// src/components/TaskList.tsx:81-86
const statusCounts = {
  ALL: tasks.length,
  TODO: tasks.filter((t) => t.status === "TODO").length,
  IN_PROGRESS: tasks.filter((t) => t.status === "IN_PROGRESS").length,
  COMPLETED: tasks.filter((t) => t.status === "COMPLETED").length,
};
```

Compute counts for display in UI.

### 7. Empty State Pattern

```tsx
// src/components/TaskList.tsx:131-142
{tasks.length === 0 ? (
  <div className="...">
    <p>No tasks yet. Create your first task!</p>
  </div>
) : filteredTasks.length === 0 ? (
  <div className="...">
    <p>No tasks match this filter.</p>
  </div>
) : (
  <div className="...">
    {filteredTasks.map((task) => <TaskCard key={task.id} task={task} />)}
  </div>
)}
```

Handle different empty states: no tasks at all, no tasks matching filter, and tasks to display.

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
# task-manager/.dockerignore:1-9

node_modules
.next
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
```

### What's Excluded and Why

| Excluded | Reason |
|----------|--------|
| `node_modules` | Rebuilt inside container with correct OS binaries |
| `.next` | Rebuilt during Docker build process |
| `.git` | Repository metadata not needed in production |
| `.env*` | Secrets should be passed via docker-compose environment |
| `coverage` | Test coverage reports not needed in production |
| `src/generated` | Prisma client regenerated during build |
| `*.md` | Documentation not needed in container |
| `Dockerfile`, `docker-compose*.yml` | Docker configs not needed inside container |
| `.dockerignore` | This file itself |

### Impact on Build Context

**Without .dockerignore:**
```
Sending build context to Docker daemon  245.3MB
```

**With .dockerignore:**
```
Sending build context to Docker daemon   2.4MB
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

## Next Steps: Phase 4

In Phase 4, you'll learn:
- Kubernetes fundamentals (Pods, Services, Deployments)
- Helm chart development
- Deployment strategies and rollout management
- Health checks, resource limits, and autoscaling
- Networking with Ingress and Services
- ConfigMaps and Secrets for configuration

This will orchestrate your containerized application at scale.

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

## Resources for Further Learning

### CI/CD & GitHub Actions
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [GitHub Actions Workflow Syntax](https://docs.github.com/en/actions/reference/workflow-syntax-for-github-actions)
- [Trivy Vulnerability Scanner](https://trivy.dev/)
- [Docker Hub](https://hub.docker.com/)

---

**Remember**: The best way to learn is to build. You've successfully built a fully functional task manager with authentication, containerized it, and set up automated CI/CD pipelines. This foundation will serve you well as you move into Kubernetes orchestration in Phase 4!
