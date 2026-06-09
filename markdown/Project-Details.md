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

## Resources for Further Learning

### React & Next.js
- [Next.js Documentation](https://nextjs.org/docs)
- [React Documentation](https://react.dev)
- [Next.js App Router Guide](https://nextjs.org/docs/app)

### TypeScript
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [TypeScript Deep Dive](https://basarat.gitbook.io/typescript/)

### Testing
- [Jest Documentation](https://jestjs.io/)
- [React Testing Library](https://testing-library.com/react)

### Prisma
- [Prisma Documentation](https://www.prisma.io/docs)
- [Prisma Schema Reference](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference)

---

**Remember**: The best way to learn is to build. You've successfully built a fully functional task manager with authentication. This foundation will serve you well as you move into DevOps topics in the next phases!
