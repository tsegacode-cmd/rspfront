import './Pagination.css'

export const PAGE_SIZE = 10

export const getPageItems = (items, page) => (
  items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
)

function Pagination({ page, itemCount, onPageChange, label = 'list' }) {
  const pageCount = Math.ceil(itemCount / PAGE_SIZE)
  if (pageCount <= 1) return null

  return (
    <nav className="pagination-controls" aria-label={`${label} pagination`}>
      <button type="button" onClick={() => onPageChange(page - 1)} disabled={page === 0}>
        Previous
      </button>
      <span>Page {page + 1} of {pageCount}</span>
      <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= pageCount - 1}>
        Next
      </button>
    </nav>
  )
}

export default Pagination
