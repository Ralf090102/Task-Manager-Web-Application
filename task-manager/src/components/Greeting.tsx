"use client";

interface GreetingProps {
  name: string;
}

export default function Greeting({ name }: GreetingProps) {
  return (
    <div className="mb-4 flex items-center gap-3 rounded-lg border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 dark:border-blue-900 dark:from-blue-950/50 dark:to-indigo-950/50">
      <span className="text-3xl">👋</span>
      <div>
        <h2 className="text-lg font-semibold text-blue-900 dark:text-blue-100">
          Welcome, {name}!
        </h2>
        <p className="text-sm text-blue-700 dark:text-blue-300">
          This is your task dashboard. Create your first task to get started.
        </p>
      </div>
    </div>
  );
}
