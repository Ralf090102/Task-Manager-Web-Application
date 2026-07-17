# Level 1: Frontend Development (React + Next.js)

**Duration:** 8 hours  
**Goal:** Understand how the user interface is built

---

## 📚 Table of Contents

1. [React Fundamentals](#1-react-fundamentals)
2. [TypeScript in React](#2-typescript-in-react)
3. [Next.js App Router](#3-nextjs-app-router)
4. [Server vs Client Components](#4-server-vs-client-components)
5. [Authentication with NextAuth v5](#5-authentication-with-nextauth-v5)
6. [Tailwind CSS v4](#6-tailwind-css-v4)
7. [Hands-On Exercises](#7-hands-on-exercises)
8. [What You've Learned](#8-what-youve-learned)

---

## 1. React Fundamentals



### What is React?

React is a JavaScript library for building user interfaces. It allows you to break your UI into reusable components and manage the data that flows through them.

### Key Concepts



#### 1. Components

**Components are functions that return JSX describing what should appear on screen.**

```tsx
// task-manager/src/components/TaskCard.tsx:57-67
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

**Key points:**

- Components start with uppercase letters (`TaskCard`, not `taskCard`)
- They receive data via **props** (properties)
- They return JSX (HTML-like syntax)



#### 2. Declarative UI

You describe *what* the UI should look like, not *how* to update it. React handles the DOM updates automatically.

```tsx
// ❌ Imperative (old way - like jQuery)
const element = document.getElementById('task-title');
element.innerText = task.title;

// ✅ Declarative (React way)
<h3>{task.title}</h3>
```



#### 3. Component Reusability

Notice how `TaskCard` is used multiple times in `TaskList`:

```tsx
// task-manager/src/components/TaskList.tsx:320-360
{colTasks.map((task) =>
  expandedId === task.id ? (
    <TaskCard
      key={task.id}
      task={task}
      onStatusChange={handleStatusChange}
      onDelete={handleDelete}
    />
  ) : (
    <TaskCard
      key={task.id}
      task={task}
      onStatusChange={handleStatusChange}
      onDelete={handleDelete}
      compact
      onExpand={() => setExpandedId(task.id)}
    />
  )
)}
```

The same component is rendered with different props, creating a different appearance (normal vs compact mode).

---



### 4. JSX and Template Literals



#### What is JSX?

JSX is a syntax extension for JavaScript that looks like HTML but allows you to write JavaScript expressions within it.

#### Template Literals in JSX

You use curly braces `{}` to embed JavaScript expressions in JSX:

```tsx
// task-manager/src/components/TaskCard.tsx:177-180
<h3 className={`font-medium ${task.status === "COMPLETED" ? "line-through opacity-60" : ""}`}>
  {task.title}
</h3>
```

**Key points:**

- `{task.title}`: Renders the value of the variable
- `{task.status === "COMPLETED" ? ...}`: Conditional expression (ternary operator)
- Backticks ``` with `${}`: Template literals for strings



#### Conditional Rendering

```tsx
// task-manager/src/components/TaskForm.tsx:76-80
{error && (
  <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
    {error}
  </div>
)}
```

This pattern: `{condition && <Component />}` only renders when condition is truthy.

#### Mapping Over Arrays

```tsx
// task-manager/src/components/TaskCard.tsx:223-227
{Object.entries(statusLabels).map(([value, label]) => (
  <option key={value} value={value}>
    {label}
  </option>
))}
```

**Important:** Always include a unique `key` prop when rendering lists. This helps React track which items have changed.

---



### 5. Event Handling

React events are named using camelCase (not lowercase):

```tsx
// onClick, onChange, onSubmit, onDragStart, onDragEnd, etc.
<button onClick={handleDelete}>Delete</button>
<select onChange={handleStatusChange}>
<form onSubmit={handleSubmit}>
```

Event handlers receive event objects:

```tsx
// task-manager/src/components/TaskForm.tsx:47-72
async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();  // Prevent default form submission
  setError("");
  setLoading(true);

  try {
    await onSubmit({ title, description, priority, dueDate, boardId });
    if (!initialData) {
      setTitle("");
      setDescription("");
      setPriority("MEDIUM");
      setDueDate("");
      setBoardId("");
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : "Something went wrong");
  } finally {
    setLoading(false);
  }
}
```

---



## 2. TypeScript in React



### Why TypeScript?

TypeScript adds static type checking to JavaScript, catching errors before runtime. This prevents bugs like:

- Calling non-existent functions
- Passing wrong data types
- Accessing properties that don't exist



### Type Definitions

```tsx
// task-manager/src/components/TaskCard.tsx:6-34
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
  recurringTaskId?: string | null;
  board?: BoardInfo | null;
}

interface TaskCardProps {
  task: Task;
  onStatusChange: (id: string, status: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  compact?: boolean;
  onExpand?: () => void;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  isDragging?: boolean;
}
```

**Key concepts:**

- `interface`: Defines the shape of an object
- `string | null`: Union type - can be string or null
- `string | undefined`: Union type - can be string or undefined
- `?:`: Optional property (e.g., `onExpand?: () => void`)
- `(id: string) => Promise<void>`: Function type returning a Promise



### Type Safety in Action

```tsx
// ❌ TypeScript would catch this error
task.id = 123;  // Error: Type 'number' is not assignable to type 'string'

// ❌ TypeScript prevents accessing non-existent properties
console.log(task.priority.color);  // Error: Property 'color' does not exist on type 'string'

// ✅ TypeScript provides autocomplete
task.status = "IN_PROGRESS";  // TypeScript knows the valid values
```



### Type Inference with Zod

Zod can automatically generate TypeScript types from validation schemas:

```tsx
// task-manager/src/lib/validations.ts:30-33
export type LoginInput = z.infer<typeof loginSchema>;
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;
```

This automatically creates TypeScript types matching the Zod schemas, preventing type mismatches.

---



## 3. Next.js App Router



### File-Based Routing

Next.js uses file-based routing. The file structure determines the URL:

```
src/app/
├── (auth)/              # Route group - doesn't affect URL
│   ├── login/
│   │   └── page.tsx     # → /login
│   └── register/
│       └── page.tsx     # → /register
└── (dashboard)/         # Route group - doesn't affect URL
    ├── dashboard/
    │   └── page.tsx     # → /dashboard
    └── teams/
        └── [id]/
            └── page.tsx # → /teams/123
```



### Route Groups with Parentheses

The `(auth)` and `(dashboard)` folders are **route groups** - they organize files without affecting the URL.

- ✅ `/login` works
- ❌ `/(auth)/login` does NOT work

Route groups are useful for:

- Organizing related routes
- Sharing layouts among routes
- Separating authentication flow from dashboard



### Dynamic Route Parameters

Square brackets `[]` indicate dynamic segments:

```tsx
// URL: /api/tasks/abc123
// id = "abc123"

// task-manager/src/app/api/tasks/[id]/route.ts:38-42
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;  // Extract the dynamic segment
  // ...
}
```



### Server-Side Redirects

```tsx
// task-manager/src/app/(dashboard)/dashboard/page.tsx:8-10
const session = await auth();
if (!session?.user?.id) redirect("/login");
```

Server-side redirects happen before the page renders, improving security and UX.

---



## 4. Server vs Client Components



### "use client" Directive

```tsx
// task-manager/src/components/TaskCard.tsx:1
"use client";
```

This directive tells Next.js that this component MUST run in the browser because it:

- Uses hooks (`useState`, `useCallback`, `useEffect`)
- Handles user interactions (onChange, onClick)
- Manages local state



### Server Components (Default)

By default, all components are server components (no directive needed):

```tsx
// task-manager/src/app/(dashboard)/dashboard/page.tsx:8-49
export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // Fetch tasks and boards in parallel
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

  const serializedBoards = boards.map((b) => ({
    id: b.id,
    name: b.name,
    color: b.color,
    teamName: b.team.name,
  }));

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6">
          <StatsWidget />
        </div>
        <TaskList initialTasks={serializedTasks} boards={serializedBoards} />
      </main>
    </>
  );
}
```

**Server components:**

- Run only on the server
- Can directly access database and server-side APIs
- Don't send JavaScript to the client
- Better for SEO and initial page load
- Can use `async`/`await` directly



### The Hybrid Pattern

Your app uses a **hybrid approach** - not a strict rule:

```
┌─────────────────────────────────────────────────────────┐
│  SERVER COMPONENT (page.tsx or component)               │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Runs on server only                              │  │
│  │  Can access database directly                     │  │
│  │  Fetches data (Prisma)                            │  │
│  │  Serializes data (Date → string)                  │  │
│  │  Passes data via props                            │  │
│  └───────────────────────────────────────────────────┘  │
│                          ↓                              │
│                          data (props)                   │
│                          ↓                              │
│  ┌───────────────────────────────────────────────────┐  │
│  │  CLIENT COMPONENT (TaskList.tsx, TaskCard.tsx)    │  │
│  │  Runs in browser                                  │  │
│  │  Receives initial data via props                  │  │
│  │  Manages local state (useState)                   │  │
│  │  Handles user interactions                        │  │
│  │  Fetches more data when needed (fetch API)        │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**Key Benefits:**
- **Performance**: Data fetched on server, less JavaScript sent to client
- **SEO**: Server components render HTML on server (good for search engines)
- **Type Safety**: TypeScript types work across server and client
- **Separation of Concerns**: Server = data, Client = interactivity

---

### Decision Tree: Server vs Client Component

```
Does the component need ANY of these?
├─ useState, useCallback, useEffect hooks?
├─ Event handlers (onClick, onChange, onSubmit)?
├─ Browser APIs (window, document, navigator)?
├─ Form state management?
└─ Real-time updates (WebSocket)?

If YES → Must be CLIENT component ("use client" directive)
If NO  → Can be SERVER component (no directive needed)
```

---

### page.tsx Files: When to Use Server vs Client

| Scenario | Type | Example |
|----------|------|---------|
| **Fetch data from database** | Server | Dashboard, profile pages |
| **Redirect unauthenticated users** | Server | Protected routes |
| **Handle form submissions** | Client | Login, register pages |
| **Search/filter with local state** | Client | Search results page |
| **Purely display data** | Server | Static content, documentation |

#### Example 1: page.tsx as SERVER Component (Most Common)

```tsx
// task-manager/src/app/(dashboard)/dashboard/page.tsx
export default async function DashboardPage() {
  const session = await auth();                      // Server-only: auth()
  const tasks = await prisma.task.findMany({         // Server-only: database
    where: { userId: session.user.id },
    include: { board: { select: { id: true, name: true, color: true } } },
  });
  
  return <TaskList initialTasks={tasks} />;         // Pass to client
}
```

**Why server component?**
- Fetches data from database
- Uses `auth()` (server-only)
- No interactivity
- Better performance (data fetched on server, less JS sent to client)

#### Example 2: page.tsx as CLIENT Component (Sometimes Needed)

```tsx
"use client";

import { useState, useEffect } from "react";

export default function SearchPage() {
  const [query, setQuery] = useState("");  // Uses useState
  const [results, setResults] = useState([]);
  
  useEffect(() => {
    // Fetch on query change
    if (query.trim()) {
      fetch(`/api/tasks/search?q=${query}`)
        .then(res => res.json())
        .then(data => setResults(data.hits));
    }
  }, [query]);
  
  return (
    <div>
      <input 
        value={query} 
        onChange={(e) => setQuery(e.target.value)}  // Event handler
        placeholder="Search tasks..."
      />
      {results.map(task => <div key={task.id}>{task.title}</div>)}
    </div>
  );
}
```

**Why client component?**
- Uses `useState` hook
- Uses `useEffect` hook
- Has event handlers
- Manages local state

---

### Components: When to Use Server vs Client

| Scenario | Type | Example |
|----------|------|---------|
| **Purely presentational** | Server | Header, footer, cards, lists |
| **Handle user interactions** | Client | Buttons, forms, inputs |
| **Manage local state** | Client | Task cards, modals, dropdowns |
| **Fetch data on mount** | Client | Dashboard with live updates |

#### Example 3: Component as SERVER Component (Purely Presentational)

```tsx
// task-manager/src/components/Navbar.tsx (example)
export default function Navbar({ user }: { user: { name: string } }) {
  return (
    <nav className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mx-auto max-w-7xl px-4 py-4">
        <h1 className="text-xl font-bold">Task Manager</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Welcome, {user.name}!
        </p>
      </div>
    </nav>
  );
}
```

**Why server component?**
- No state management
- No hooks
- No event handlers
- Just renders props

#### Example 4: Component as CLIENT Component (Interactive)

```tsx
// task-manager/src/components/TaskCard.tsx
"use client";

import { useState } from "react";

export default function TaskCard({ task, onStatusChange }: TaskCardProps) {
  const [loading, setLoading] = useState(false);  // Uses useState
  
  async function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setLoading(true);
    try {
      await onStatusChange(task.id, e.target.value);
    } finally {
      setLoading(false);
    }
  }
  
  return (
    <div>
      <select 
        value={task.status} 
        onChange={handleStatusChange}  // Event handler
        disabled={loading}
      >
        <option value="TODO">To Do</option>
        <option value="IN_PROGRESS">In Progress</option>
        <option value="COMPLETED">Completed</option>
      </select>
    </div>
  );
}
```

**Why client component?**
- Uses `useState` hook
- Has event handlers
- Manages local state

---

### Common Pitfalls

❌ **Don't force client components unnecessarily**

```tsx
// ❌ Bad - making a presentational component client for no reason
"use client";  // Unnecessary!

export function StaticHeader() {
  return <h1>Task Manager</h1>;  // No state, no events
}
```

✅ **Good - keep it as server component**

```tsx
// ✅ Good - no "use client" directive needed
export function StaticHeader() {
  return <h1>Task Manager</h1>;
}
```

---

❌ **Don't make page.tsx client just to fetch data**

```tsx
// ❌ Bad - page.tsx as client just for fetching
"use client";

export default function TasksPage() {
  const [tasks, setTasks] = useState([]);
  
  useEffect(() => {
    fetch('/api/tasks')
      .then(res => res.json())
      .then(setTasks);
  }, []);
  
  return <TaskList tasks={tasks} />;
}
```

✅ **Good - page.tsx as server, fetch data directly**

```tsx
// ✅ Good - server component fetches data directly
export default async function TasksPage() {
  const tasks = await prisma.task.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });
  
  return <TaskList initialTasks={tasks} />;
}
```

---

❌ **Don't use hooks in server components**

```tsx
// ❌ Bad - using useState in server component
export default async function DashboardPage() {
  const [loading, setLoading] = useState(false);  // Error: useState is client-only!
  // ...
}
```

✅ **Good - move to client component if hooks are needed**

```tsx
// Server component fetches data
export default async function DashboardPage() {
  const tasks = await prisma.task.findMany({...});
  return <TaskList initialTasks={tasks} />;
}

// Client component manages state
"use client";
export function TaskList({ initialTasks }: TaskListProps) {
  const [loading, setLoading] = useState(false);  // ✅ OK in client component
  // ...
}
```

---

❌ **Don't forget to serialize Date objects**

```tsx
// ❌ Bad - Date objects can't be sent over JSON
const serializedTasks = tasks.map((t) => ({ ...t }));  // t.dueDate is a Date object!

// ✅ Good - convert Date objects to ISO strings
const serializedTasks = tasks.map((t) => ({
  ...t,
  dueDate: t.dueDate?.toISOString() ?? null,
  createdAt: t.createdAt.toISOString(),
}));
```

---

### Quick Reference

| Question | Answer |
|----------|--------|
| **Are all page.tsx files server components?** | No, only if they don't need state/hooks/events |
| **Are all components client components?** | No, only if they need interactivity |
| **When should I use "use client"?** | When you need useState, useEffect, event handlers, or browser APIs |
| **Can I have a server component with client children?** | Yes! This is the hybrid pattern |
| **Can I have a client component with server children?** | No! Server components can't be imported by client components |

---

### Why Serialize Date Objects?

JavaScript's `Date` objects can't be sent over JSON. They must be converted to ISO strings:

```tsx
// ❌ Can't send Date objects directly
{ ...task }  // task.dueDate is a Date object - won't work

// ✅ Serialize to ISO string
{ 
  ...t,
  dueDate: t.dueDate?.toISOString() ?? null,  // "2025-01-15T10:30:00.000Z"
  createdAt: t.createdAt.toISOString(),
}
```

---



## 5. Authentication with NextAuth v5



### NextAuth Configuration

```tsx
// task-manager/src/lib/auth.ts:8-58
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
// task-manager/src/app/(dashboard)/dashboard/page.tsx:8-10
const session = await auth();
if (!session?.user?.id) redirect("/login");
```



### Using Auth in Client Components

```tsx
// task-manager/src/components/AuthForm.tsx (example)
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
// task-manager/src/app/api/tasks/route.ts:41-45
const session = await auth();
if (!session?.user?.id) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

Always check the session on the server, even if the client is authenticated.

---



## 6. Tailwind CSS v4



### What's New in v4?

Tailwind v4 uses a new `@import` syntax instead of `@tailwind` directives:

```css
/* task-manager/src/app/globals.css:1 */
@import "tailwindcss";
```



### Utility-First CSS

Instead of writing custom CSS, you use utility classes:

```tsx
// task-manager/src/components/TaskCard.tsx:174
<div className="group rounded-lg border border-zinc-200 bg-white p-4 transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900">
```

**Class breakdown:**

- `group`: Enables group-hover states (parent can style children)
- `rounded-lg`: Rounded corners (0.5rem)
- `border`: Adds border
- `border-zinc-200`: Border color
- `bg-white`: Background color
- `p-4`: Padding (1rem)
- `transition-shadow`: Smooth shadow transition
- `hover:shadow-md`: Shadow on hover
- `dark:border-zinc-800`: Dark mode border color
- `dark:bg-zinc-900`: Dark mode background color



### Dark Mode Support

```tsx
// task-manager/src/components/TaskCard.tsx:174
<div className="... dark:border-zinc-800 dark:bg-zinc-900">
```

- `dark:` prefix applies styles when dark mode is active
- Dark mode is determined by user's system preference or a toggle



### Conditional Classes

```tsx
// task-manager/src/components/TaskCard.tsx:177-180
<h3 className={`font-medium ${task.status === "COMPLETED" ? "line-through opacity-60" : ""}`}>
  {task.title}
</h3>
```

Use template literals with conditional logic for dynamic classes.

### Responsive Design

```tsx
// task-manager/src/components/TaskList.tsx:290
<div className="grid gap-4 md:grid-cols-3">
```

- `md:grid-cols-3`: On medium screens and larger, use 3 columns
- Default: 1 column on small screens



### Custom Utilities

```css
/* task-manager/src/app/globals.css:27-34 */
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



## 7. Hands-On Exercises



### Exercise 1: Run the App Locally

```bash
cd task-manager
npm run dev
npm install
```

Open [http://localhost:3000](http://localhost:3000)

### Exercise 2: Create a New Component

Create `task-manager/src/components/Greeting.tsx`:

```tsx
// task-manager/src/components/Greeting.tsx
interface GreetingProps {
  name: string;
}

export default function Greeting({ name }: GreetingProps) {
  return (
    <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-950/50">
      <h2 className="text-lg font-semibold text-blue-900 dark:text-blue-100">
        Welcome, {name}! 👋
      </h2>
    </div>
  );
}
```

Import it in the dashboard page:

```tsx
// task-manager/src/app/(dashboard)/dashboard/page.tsx
import Greeting from "@/components/Greeting";

export default async function DashboardPage() {
  // ... existing code

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6">
          <Greeting name={session.user.name || "User"} />
          <StatsWidget />
        </div>
        <TaskList initialTasks={serializedTasks} boards={serializedBoards} />
      </main>
    </>
  );
}
```



### Exercise 3: Add a New Route

Create `task-manager/src/app/(dashboard)/profile/page.tsx`:

```tsx
// task-manager/src/app/(dashboard)/profile/page.tsx
import { auth } from "@/lib/auth";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Profile</h1>
      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-4 text-lg font-semibold">User Information</h2>
        <div className="space-y-2">
          <p><strong>Name:</strong> {session.user.name}</p>
          <p><strong>Email:</strong> {session.user.email}</p>
          <p><strong>ID:</strong> {session.user.id}</p>
        </div>
      </div>
    </div>
  );
}
```

Visit [http://localhost:3000/profile](http://localhost:3000/profile)

### Exercise 4: Modify an Existing Component

Change the TaskCard styling to add a glow effect for high-priority tasks:

```tsx
// task-manager/src/components/TaskCard.tsx:174
<div className={`group rounded-lg border border-zinc-200 bg-white p-4 transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 ${
  task.priority === "HIGH" ? "ring-2 ring-red-400 ring-opacity-50" : ""
}`}>
```

---



## 8. What You've Learned



### Technologies Mastered

✅ React components and hooks  
✅ TypeScript for type safety  
✅ Next.js App Router and server components  
✅ API route handlers  
✅ Authentication with NextAuth v5  
✅ Form validation with Zod  
✅ Styling with Tailwind CSS v4

### Core Concepts

✅ Component composition and reusability  
✅ Props drilling and callbacks  
✅ Client vs server components  
✅ Async/await patterns  
✅ Error handling  
✅ Data validation  
✅ Authentication flows  

### Best Practices

✅ Type-safe development  
✅ Server-side rendering for performance  
✅ Protected routes and API endpoints  
✅ Proper error handling  
✅ Loading states  
✅ Form validation  

---



## 📚 Next Steps

After completing Level 1, you're ready for:

**Level 2: Backend Development (API + Database)** - 6 hours

- Prisma ORM
- PostgreSQL Database
- API Design
- Form Validation with Zod
- Testing with Jest

Continue with `Level-2.md` when you're ready!

---

**Happy learning! 🚀**