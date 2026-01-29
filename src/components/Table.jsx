const { useMemo, useState, useEffect, useRef } = React;

/**
 * Reusable Table with client-side pagination.
 *
 * Props:
 * - columns: [{ key: 'field', label: 'Header', render?: (row) => JSX }]
 * - data:    array of rows (objects)
 * - pageSize?: number (default 10)
 * - striped?: boolean
 * - hover?: boolean
 * - small?: boolean
 * - loading?: boolean
 * - emptyText?: string
 * - rowKey?: string | (row, idx) => any
 */
function Table({
  columns = [],
  data = [],
  pageSize = 10,
  striped = true,
  hover = true,
  small = false,
  loading = false,
  emptyText = "No records found",
  rowKey = null, // optional: string field name or function(row, idx) -> key
}) {
  const [currentPage, setCurrentPage] = useState(1);

  // derive a row key getter to avoid duplicate key warnings
  const getRowKey = React.useMemo(() => {
    if (typeof rowKey === 'function') return rowKey;
    if (typeof rowKey === 'string' && rowKey.length) return (r) => r?.[rowKey];
    const common = ['attendance_id','record_id','id','user_id','room_id','schedule_id','key','_id'];
    return (r, idx) => {
      for (const k of common) {
        if (r && Object.prototype.hasOwnProperty.call(r, k) && (r[k] !== undefined && r[k] !== null)) return r[k];
      }
      // fallback: stable synthetic key using index + JSON snippet
      try { return `${idx}-${String(r && r.date ? r.date : '')}-${String(r && r.time_in ? r.time_in : '')}`; } catch(e) { return idx; }
    };
  }, [rowKey]);

  // Local loading delay: show spinner for 1.5s whenever `data` changes
  const [localLoading, setLocalLoading] = useState(false);
  const loadingTimerRef = useRef(null);
  const startTimerRef = useRef(null);

  useEffect(() => {
    // Schedule turning localLoading on in the next tick to avoid sync setState in effect
    if (startTimerRef.current) clearTimeout(startTimerRef.current);
    startTimerRef.current = setTimeout(() => setLocalLoading(true), 0);

    if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    loadingTimerRef.current = setTimeout(() => {
      setLocalLoading(false);
      loadingTimerRef.current = null;
    }, 1500);

    return () => {
      if (startTimerRef.current) {
        clearTimeout(startTimerRef.current);
        startTimerRef.current = null;
      }
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current);
        loadingTimerRef.current = null;
      }
    };
  }, [data]);

  // final loading state respects external `loading` prop and local delay
  const finalLoading = Boolean(loading) || localLoading;

  const total = data.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Clamp current page so it’s always in range
  const safeCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);

  const pageData = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, safeCurrentPage, pageSize]);

  const goToPage = (page) => {
    const target = Math.min(Math.max(page, 1), totalPages);
    setCurrentPage(target);
  };

  const tableClassNames = [
    "table",
    striped ? "table-striped" : "",
    hover ? "table-hover" : "",
    small ? "table-sm" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Small inline kebab menu used when a column provides `actions` (array of {label, onClick})
  function KebabMenu({ actions = [], row }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
      const onDocClick = (e) => {
        if (ref.current && !ref.current.contains(e.target)) setOpen(false);
      };
      document.addEventListener('click', onDocClick);
      return () => document.removeEventListener('click', onDocClick);
    }, []);

    return (
      <div ref={ref} className="position-relative d-inline-block">
        <button
          type="button"
          className="btn btn-light btn-sm"
          onClick={() => setOpen((s) => !s)}
          aria-haspopup="true"
          aria-expanded={open}
          style={{ width: 36, height: 36, padding: 0, borderRadius: 6 }}
        >
          <span style={{ fontSize: 18, lineHeight: '36px' }}>⋮</span>
        </button>

        {open && (
          <div className="card" style={{ position: 'absolute', right: 0, top: '110%', zIndex: 250 }}>
            <div className="list-group list-group-flush">
              {actions.map((a, i) => (
                <button
                  key={i}
                  type="button"
                  className={`list-group-item list-group-item-action ${a.variant === 'danger' ? 'text-danger' : ''}`}
                  onClick={() => { setOpen(false); try { a.onClick(row); } catch (err) { console.error(err); } }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Loader CSS (scoped here for the Table component) */}
      <style>{`
        .loader {
          width: 50px;
          aspect-ratio: 1;
          display: grid;
          border: 4px solid transparent;
          border-radius: 50%;
          border-right-color: #25b09b;
          animation: l15 1s infinite linear;
          margin: 0 auto;
        }
        .loader::before,
        .loader::after {
          content: "";
          grid-area: 1/1;
          margin: 2px;
          border: inherit;
          border-radius: 50%;
          animation: l15 2s infinite;
        }
        .loader::after {
          margin: 8px;
          animation-duration: 3s;
        }
        @keyframes l15 {
          100% { transform: rotate(1turn); }
        }
      `}</style>

      <div className="table-responsive">
        <table className={tableClassNames}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key || col.label}>{col.label}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {finalLoading && (
              <tr>
                <td colSpan={columns.length} className="text-center py-3">
                  <div className="loader" role="status" aria-label="Loading" />
                </td>
              </tr>
            )}

            {!finalLoading && pageData.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="text-center py-3">
                  {emptyText}
                </td>
              </tr>
            )}

            {!finalLoading &&
              pageData.map((row, idx) => {
                // compute a stable unique key for each row to avoid React duplicate key warnings
                const rowKey = (row && (row.attendance_id ?? row.record_id ?? row.id)) || `${row?.user_id ?? 'u'}-${row?.date ?? ''}-${row?.time_in ?? ''}-${row?.time_check ?? ''}-${row?.time_out ?? ''}-${idx}`;
                return (
                  <tr key={rowKey}>
                    {columns.map((col) => (
                      <td key={col.key || col.label}>
                        {col.render
                          ? col.render(row)
                          : col.actions && Array.isArray(col.actions)
                          ? <KebabMenu actions={col.actions} row={row} />
                          : row[col.key]}
                      </td>
                    ))}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="d-flex justify-content-between align-items-center">
          <div className="text-muted small">
            Showing <strong>{total === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1}</strong> to <strong>{Math.min(safeCurrentPage * pageSize, total)}</strong> of <strong>{total}</strong> entries
          </div>

          <nav>
            <ul
              className="pagination mb-0"
              style={{
                // make active page green (Bootstrap 5 CSS vars)
                "--bs-pagination-active-bg": "#198754",
                "--bs-pagination-active-border-color": "#198754",
              }}
            >
              <li className={`page-item ${safeCurrentPage === 1 ? "disabled" : ""}`}>
                <button className="page-link" onClick={() => goToPage(safeCurrentPage - 1)}>Previous</button>
              </li>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <li key={page} className={`page-item ${page === safeCurrentPage ? "active" : ""}`}>
                  <button className="page-link" onClick={() => goToPage(page)}>{page}</button>
                </li>
              ))}

              <li className={`page-item ${safeCurrentPage === totalPages ? "disabled" : ""}`}>
                <button className="page-link" onClick={() => goToPage(safeCurrentPage + 1)}>Next</button>
              </li>
            </ul>
          </nav>
        </div>
      )}
    </div>
  );
}

// export as ES module default (do not attach to window)
export default Table;
