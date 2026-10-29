export async function startGeneration(id: string, request: typeof fetch = fetch) {
  const response = await request(`/api/humor/runs/${id}/generate`, {method: 'POST'});
  if (response.redirected || !response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('Your session may have expired. Sign in again, then open your saved run.');
  }
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Caption generation failed. Open your saved run to retry.');
  if (!['ready','generating','pending'].includes(result.status)) throw new Error('Generation could not be confirmed. Open your saved run to check its status.');
  return result as {status: string; runId: string};
}
