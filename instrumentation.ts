export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { checkDatabaseSchema } = await import('./lib/schema-check');
  await checkDatabaseSchema();
}
