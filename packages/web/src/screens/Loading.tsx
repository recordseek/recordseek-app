export function Loading({ status = 'Loading…' }: { status?: string }) {
  return (
    <main>
      <div className="la-square-jelly-box la-2x la-dark" aria-hidden="true">
        <div />
        <div />
      </div>
      <h3 className="text-center" role="status">
        {status}
      </h3>
    </main>
  );
}
