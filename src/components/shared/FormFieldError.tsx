export function FormFieldError({ message }: { message?: string }) {
  if (!message) return null;

  return (
    <p className="mt-1 text-xs text-[hsl(var(--destructive))]">
      {message}
    </p>
  );
}

