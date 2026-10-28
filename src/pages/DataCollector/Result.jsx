import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { dataRegistrationAPI, userAPI } from '../../services/api'
import { getRegistrationExportRows } from '../../utils/registrationExport'
import DOMPurify from 'dompurify'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import './Result.css'

const DOCUMENT_STORAGE_KEY = 'ebc_registration_documents'
const DEFAULT_DOCUMENT_COLUMNS = [
  { id: 'client_name', label: 'Client Name', type: 'text' },
  { id: 'client_phone', label: 'Phone', type: 'text' },
  { id: 'kebele', label: 'Kebele', type: 'text' },
  { id: 'house_no', label: 'House No', type: 'text' },
  { id: 'tv_no', label: 'TV No', type: 'number' },
  { id: 'staff_username', label: 'Staff', type: 'text' },
]
const DOCUMENT_PAGE_SIZE = 25
const isUnapprovedRegistration = registration =>
  ['unapproved staff', 'unapproval staff'].includes(
    String(registration.staff_username || '').trim().toLowerCase()
  )
const getRegistrationStaffLabel = registration => {
  const username = String(registration?.staff_username || '').trim()
  const fullName = String(registration?.staff_full_name || '').trim()
  const identity = fullName && username && fullName.toLocaleLowerCase() !== username.toLocaleLowerCase()
    ? `${fullName} (@${username})`
    : fullName || username || 'N/A'
  const role = String(registration?.staff_role || '').trim()
  return role ? `${identity} · ${role}` : identity
}

const readRegistrationDocuments = registrationId => {
  try {
    const saved = JSON.parse(localStorage.getItem(DOCUMENT_STORAGE_KEY) || '{}')
    return Array.isArray(saved[String(registrationId)]) ? saved[String(registrationId)] : []
  } catch (error) {
    console.error('Could not load registration documents:', error)
    return []
  }
}

function RegistrationDocumentsModal({ registration, registrations, onClose }) {
  const [documents, setDocuments] = useState(() => readRegistrationDocuments(registration.id))
  const [editingDocument, setEditingDocument] = useState(null)
  const [error, setError] = useState('')
  const name = registration.client_name || 'Registration'

  const persistDocuments = nextDocuments => {
    try {
      const saved = JSON.parse(localStorage.getItem(DOCUMENT_STORAGE_KEY) || '{}')
      saved[String(registration.id)] = nextDocuments
      localStorage.setItem(DOCUMENT_STORAGE_KEY, JSON.stringify(saved))
      setDocuments(nextDocuments)
      setError('')
      return true
    } catch (storageError) {
      console.error('Could not save registration documents:', storageError)
      setError('Could not save this document in browser storage. Check available storage and try again.')
      return false
    }
  }

  const saveDocument = documentData => {
    const nextDocuments = editingDocument?.id
      ? documents.map(item => item.id === editingDocument.id ? documentData : item)
      : [documentData, ...documents]
    if (persistDocuments(nextDocuments)) setEditingDocument(null)
  }

  const deleteDocument = id => {
    const nextDocuments = documents.filter(item => item.id !== id)
    persistDocuments(nextDocuments)
  }

  return (
    <div className="result-modal-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="result-documents-modal" role="dialog" aria-modal="true" aria-labelledby="documents-title">
        <header className="result-documents-header">
          <div>
            <h2 id="documents-title">Documents — {name}</h2>
            <p>Saved documents belong to this registration.</p>
          </div>
          <button type="button" className="result-modal-close" onClick={onClose} aria-label="Close documents">×</button>
        </header>
        {error && <div className="result-document-error" role="alert">{error}</div>}
        <div className="result-document-actions">
          <button type="button" className="result-document-primary" onClick={() => setEditingDocument({
            id: '',
            title: '',
            body: '',
            columns: DEFAULT_DOCUMENT_COLUMNS.map(column => ({ ...column })),
            rows: [],
          })}>＋ New document</button>
        </div>
        {documents.length === 0 ? (
          <div className="result-documents-empty">No saved documents yet. Create a document to get started.</div>
        ) : (
          <ul className="result-document-list">
            {documents.map(documentItem => (
              <li key={documentItem.id} className="result-document-item">
                <div>
                  <strong>{documentItem.title || 'Untitled document'}</strong>
                  <span>Updated {new Date(documentItem.updatedAt).toLocaleString()}</span>
                </div>
                <div className="result-document-item-actions">
                  <button type="button" onClick={() => setEditingDocument(documentItem)}>Edit</button>
                  <button type="button" className="result-document-delete" onClick={() => deleteDocument(documentItem.id)}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {editingDocument && (
        <RegistrationDocumentEditor
          document={editingDocument}
          registrations={registrations}
          onCancel={() => setEditingDocument(null)}
          onSave={saveDocument}
        />
      )}
    </div>
  )
}

function RegistrationDocumentEditor({ document, registrations, onCancel, onSave }) {
  const [title, setTitle] = useState(document.title || '')
  const [body] = useState(document.body || '')
  const [columns, setColumns] = useState(document.columns?.length
    ? document.columns.map(column => ({ ...column }))
    : DEFAULT_DOCUMENT_COLUMNS.map(column => ({ ...column })))
  const [rows, setRows] = useState(document.rows?.length
    ? document.rows.map(row => ({ ...row, values: { ...row.values } }))
    : [{ id: `row-${Date.now()}`, values: {} }])
  const [page, setPage] = useState(1)
  const [rowQueries, setRowQueries] = useState({})
  const [activeSearchRow, setActiveSearchRow] = useState('')
  const [error, setError] = useState('')
  const editorRef = useRef(null)
  const pageCount = Math.max(1, Math.ceil(rows.length / DOCUMENT_PAGE_SIZE))
  const visibleRows = rows.slice((page - 1) * DOCUMENT_PAGE_SIZE, page * DOCUMENT_PAGE_SIZE)

  const updateColumn = (columnId, property, value) => {
    setColumns(current => current.map(column => column.id === columnId ? { ...column, [property]: value } : column))
  }

  const addColumn = () => {
    const id = `custom_${Date.now()}`
    setColumns(current => [...current, { id, label: 'New column', type: 'text' }])
  }

  const removeColumn = columnId => {
    if (columns.length === 1) {
      setError('A table must have at least one column.')
      return
    }
    setColumns(current => current.filter(column => column.id !== columnId))
    setRows(current => current.map(row => {
      const values = { ...row.values }
      delete values[columnId]
      return { ...row, values }
    }))
    setError('')
  }

  const updateCell = (rowId, columnId, value) => {
    setRows(current => current.map(row => row.id === rowId
      ? { ...row, values: { ...row.values, [columnId]: value } }
      : row))
  }

  const addRow = () => {
    const newRow = { id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, values: {} }
    setRows(current => {
      const nextRows = [...current, newRow]
      setPage(Math.ceil(nextRows.length / DOCUMENT_PAGE_SIZE))
      return nextRows
    })
  }

  const selectRegistration = (rowId, record) => {
    const values = Object.fromEntries(columns.map(column => [column.id, record[column.id] ?? '']))
    setRows(current => current.map(row => row.id === rowId ? { ...row, values } : row))
    setRowQueries(current => ({ ...current, [rowId]: record.client_name || record.client_phone || '' }))
    setActiveSearchRow('')
  }

  const applyFormatting = command => {
    editorRef.current?.focus()
    if (command === 'heading') window.document.execCommand('formatBlock', false, 'h2')
    else window.document.execCommand(command, false)
  }

  const handleSave = () => {
    if (!title.trim()) {
      setError('Enter a document title before saving.')
      return
    }
    onSave({
      id: document.id || `document-${Date.now()}`,
      title: title.trim(),
      body: DOMPurify.sanitize(editorRef.current?.innerHTML || body),
      columns,
      rows,
      updatedAt: new Date().toISOString(),
    })
  }

  return (
    <div className="result-modal-backdrop result-editor-backdrop" role="presentation">
      <section className="result-document-editor" role="dialog" aria-modal="true" aria-labelledby="document-editor-title">
        <header className="result-editor-header">
          <div>
            <h2 id="document-editor-title">{document.id ? 'Edit document' : 'New document'}</h2>
            <p>Format your document and build a searchable, editable table.</p>
          </div>
          <button type="button" className="result-modal-close" onClick={onCancel} aria-label="Close editor">×</button>
        </header>
        <div className="result-editor-scroll">
          <label className="result-document-title-field">
            Document title
            <input value={title} onChange={event => setTitle(event.target.value)} placeholder="Enter a document title" />
          </label>
          <div className="result-word-toolbar" aria-label="Text formatting">
            <button type="button" onClick={() => applyFormatting('bold')} aria-label="Bold"><strong>B</strong></button>
            <button type="button" onClick={() => applyFormatting('italic')} aria-label="Italic"><em>I</em></button>
            <button type="button" onClick={() => applyFormatting('underline')} aria-label="Underline"><u>U</u></button>
            <button type="button" onClick={() => applyFormatting('insertUnorderedList')}>• List</button>
            <button type="button" onClick={() => applyFormatting('heading')} onMouseDown={event => event.preventDefault()} title="Format the current paragraph as a heading">Heading</button>
          </div>
          <div
            ref={editorRef}
            className="result-word-page"
            contentEditable
            suppressContentEditableWarning
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(body) }}
            data-placeholder="Start writing your document..."
            aria-label="Document content"
          />

          <section className="result-editable-table-section">
            <div className="result-editable-table-heading">
              <div><h3>Flexible table</h3><p>Search a registration in a row to fill matching columns automatically.</p></div>
              <button type="button" onClick={addColumn}>＋ Add column</button>
            </div>
            <div className="result-editable-table-scroll">
              <table className="result-editable-table">
                <thead>
                  <tr>
                    <th className="result-row-number-heading">Row</th>
                    {columns.map(column => (
                      <th key={column.id}>
                        <input value={column.label} onChange={event => updateColumn(column.id, 'label', event.target.value)} aria-label="Column header" />
                        <select value={column.type} onChange={event => updateColumn(column.id, 'type', event.target.value)} aria-label={`${column.label} data type`}>
                          <option value="text">Text</option>
                          <option value="number">Number</option>
                          <option value="date">Date</option>
                        </select>
                        <button type="button" className="result-remove-column" onClick={() => removeColumn(column.id)} aria-label={`Remove ${column.label} column`}>×</button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row, index) => {
                    const query = rowQueries[row.id] || ''
                    const normalizedQuery = query.trim().toLocaleLowerCase()
                    const matches = normalizedQuery
                      ? registrations.filter(record => Object.values(record).some(value =>
                        String(value ?? '').toLocaleLowerCase().includes(normalizedQuery))).slice(0, 6)
                      : []
                    return (
                      <tr key={row.id}>
                        <td className="result-row-number">
                          {(page - 1) * DOCUMENT_PAGE_SIZE + index + 1}
                          <label>
                            Search
                            <input
                              value={query}
                              onFocus={() => setActiveSearchRow(row.id)}
                              onChange={event => {
                                setRowQueries(current => ({ ...current, [row.id]: event.target.value }))
                                setActiveSearchRow(row.id)
                              }}
                              placeholder="Find registration..."
                              aria-label={`Search registrations for row ${(page - 1) * DOCUMENT_PAGE_SIZE + index + 1}`}
                            />
                          </label>
                          {activeSearchRow === row.id && matches.length > 0 && (
                            <div className="result-registration-suggestions">
                              {matches.map(record => (
                                <button type="button" key={record.id} onMouseDown={event => event.preventDefault()} onClick={() => selectRegistration(row.id, record)}>
                                  <strong>{record.client_name || 'Unnamed registration'}</strong>
                                  <span>{record.client_phone || 'No phone'} · {record.kebele || 'No kebele'}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </td>
                        {columns.map(column => (
                          <td key={column.id}>
                            <input
                              type={column.type}
                              value={row.values?.[column.id] ?? ''}
                              onChange={event => updateCell(row.id, column.id, event.target.value)}
                              aria-label={`${column.label}, row ${(page - 1) * DOCUMENT_PAGE_SIZE + index + 1}`}
                            />
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="result-table-footer">
              <button type="button" onClick={addRow}>＋ Add row</button>
              <span>{rows.length} rows · showing up to {DOCUMENT_PAGE_SIZE} per page</span>
              <div>
                <button type="button" onClick={() => setPage(current => Math.max(1, current - 1))} disabled={page === 1}>Previous</button>
                <span>Page {page} of {pageCount}</span>
                <button type="button" onClick={() => setPage(current => Math.min(pageCount, current + 1))} disabled={page === pageCount}>Next</button>
              </div>
            </div>
          </section>
          {error && <div className="result-document-error" role="alert">{error}</div>}
        </div>
        <footer className="result-editor-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" className="result-document-primary" onClick={handleSave}>Save document</button>
        </footer>
      </section>
    </div>
  )
}

function Result() {
  const navigate = useNavigate()
  const [staffList, setStaffList] = useState([])
  const [selectedStaff, setSelectedStaff] = useState('all')
  const [completeRegistrations, setCompleteRegistrations] = useState([])
  const [incompleteRegistrations, setIncompleteRegistrations] = useState([])
  const [filteredCompleteRegistrations, setFilteredCompleteRegistrations] = useState([])
  const [filteredIncompleteRegistrations, setFilteredIncompleteRegistrations] = useState([])
  const [loading, setLoading] = useState(true)
  const [notification, setNotification] = useState(null)
  const [documentsRegistration, setDocumentsRegistration] = useState(null)

  // Search and filter states for Complete section
  const [completeSearchQuery, setCompleteSearchQuery] = useState('')
  const [completePeriod, setCompletePeriod] = useState('all')
  const [completeStartDate, setCompleteStartDate] = useState('')
  const [completeEndDate, setCompleteEndDate] = useState('')
  const [completeTvFilter, setCompleteTvFilter] = useState('all')
  const [completePersonFilter, setCompletePersonFilter] = useState('all')
  const [completeApprovalFilter, setCompleteApprovalFilter] = useState('all')
  const [completeReceiptFilter, setCompleteReceiptFilter] = useState('all')
  const [completeAmountFilter, setCompleteAmountFilter] = useState('all')

  // Search and filter states for Incomplete section
  const [incompleteSearchQuery, setIncompleteSearchQuery] = useState('')
  const [incompletePeriod, setIncompletePeriod] = useState('all')
  const [incompleteStartDate, setIncompleteStartDate] = useState('')
  const [incompleteEndDate, setIncompleteEndDate] = useState('')
  const [incompleteTvFilter, setIncompleteTvFilter] = useState('all')
  const [incompletePersonFilter, setIncompletePersonFilter] = useState('all')
  const [incompleteApprovalFilter, setIncompleteApprovalFilter] = useState('all')
  const [incompleteReceiptFilter, setIncompleteReceiptFilter] = useState('all')
  const [incompleteAmountFilter, setIncompleteAmountFilter] = useState('all')

  // Voice search states
  const [isListeningComplete, setIsListeningComplete] = useState(false)
  const [isListeningIncomplete, setIsListeningIncomplete] = useState(false)
  const recognitionCompleteRef = useRef(null)
  const recognitionIncompleteRef = useRef(null)

  // Pagination states
  const [completeCurrentPage, setCompleteCurrentPage] = useState(1)
  const [incompleteCurrentPage, setIncompleteCurrentPage] = useState(1)
  const completeItemsPerPage = DOCUMENT_PAGE_SIZE
  const incompleteItemsPerPage = DOCUMENT_PAGE_SIZE

  // Statistics
  const [stats, setStats] = useState({
    totalComplete: 0,
    totalIncomplete: 0,
    totalEarned: 0,
    remainingEarn: 0
  })

  useEffect(() => {
    loadData()
    
    // Initialize speech recognition for both search boxes
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      
      // Complete search recognition
      recognitionCompleteRef.current = new SpeechRecognition()
      recognitionCompleteRef.current.continuous = false
      recognitionCompleteRef.current.interimResults = false
      recognitionCompleteRef.current.lang = 'en-US'
      
      recognitionCompleteRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript
        console.log('Complete voice search:', transcript)
        setCompleteSearchQuery(transcript)
        setIsListeningComplete(false)
        showNotification(`🎤 Heard: "${transcript}"`, 'success')
      }
      
      recognitionCompleteRef.current.onerror = (event) => {
        console.error('Complete search voice error:', event.error)
        setIsListeningComplete(false)
        if (event.error === 'no-speech') {
          showNotification('❌ No speech detected', 'error')
        } else if (event.error === 'not-allowed') {
          showNotification('❌ Microphone access denied', 'error')
        }
      }
      
      recognitionCompleteRef.current.onend = () => {
        setIsListeningComplete(false)
      }
      
      // Incomplete search recognition
      recognitionIncompleteRef.current = new SpeechRecognition()
      recognitionIncompleteRef.current.continuous = false
      recognitionIncompleteRef.current.interimResults = false
      recognitionIncompleteRef.current.lang = 'en-US'
      
      recognitionIncompleteRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript
        console.log('Incomplete voice search:', transcript)
        setIncompleteSearchQuery(transcript)
        setIsListeningIncomplete(false)
        showNotification(`🎤 Heard: "${transcript}"`, 'success')
      }
      
      recognitionIncompleteRef.current.onerror = (event) => {
        console.error('Incomplete search voice error:', event.error)
        setIsListeningIncomplete(false)
        if (event.error === 'no-speech') {
          showNotification('❌ No speech detected', 'error')
        } else if (event.error === 'not-allowed') {
          showNotification('❌ Microphone access denied', 'error')
        }
      }
      
      recognitionIncompleteRef.current.onend = () => {
        setIsListeningIncomplete(false)
      }
    }
    
    return () => {
      if (recognitionCompleteRef.current) {
        try {
          recognitionCompleteRef.current.stop()
        } catch (e) {}
      }
      if (recognitionIncompleteRef.current) {
        try {
          recognitionIncompleteRef.current.stop()
        } catch (e) {}
      }
    }
  }, [])

  useEffect(() => {
    applyCompleteFilters()
  }, [completeRegistrations, completeSearchQuery, completePeriod, completeStartDate, completeEndDate, selectedStaff, staffList, completeTvFilter, completePersonFilter, completeApprovalFilter, completeReceiptFilter, completeAmountFilter])

  useEffect(() => {
    applyIncompleteFilters()
  }, [incompleteRegistrations, incompleteSearchQuery, incompletePeriod, incompleteStartDate, incompleteEndDate, selectedStaff, staffList, incompleteTvFilter, incompletePersonFilter, incompleteApprovalFilter, incompleteReceiptFilter, incompleteAmountFilter])

  useEffect(() => {
    calculateStats(filteredCompleteRegistrations, filteredIncompleteRegistrations)
  }, [filteredCompleteRegistrations, filteredIncompleteRegistrations])

  useEffect(() => {
    setCompleteCurrentPage(1)
  }, [filteredCompleteRegistrations])

  useEffect(() => {
    setIncompleteCurrentPage(1)
  }, [filteredIncompleteRegistrations])

  const applyCompleteFilters = () => {
    let filtered = [...completeRegistrations]

    // Staff filter
    filtered = filterBySelectedStaff(filtered)

    // Search filter
    if (completeSearchQuery) {
      const query = completeSearchQuery.toLowerCase()
      filtered = filtered.filter(reg =>
        reg.client_name?.toLowerCase().includes(query) ||
        reg.client_phone?.toLowerCase().includes(query) ||
        reg.kebele?.toLowerCase().includes(query) ||
        reg.house_no?.toLowerCase().includes(query)
      )
    }

    // TV filter
    if (completeTvFilter !== 'all') {
      if (completeTvFilter === '1') {
        filtered = filtered.filter(reg => parseInt(reg.tv_no) === 1)
      } else if (completeTvFilter === '2-5') {
        filtered = filtered.filter(reg => {
          const tvCount = parseInt(reg.tv_no)
          return tvCount >= 2 && tvCount <= 5
        })
      } else if (completeTvFilter === '6-10') {
        filtered = filtered.filter(reg => {
          const tvCount = parseInt(reg.tv_no)
          return tvCount >= 6 && tvCount <= 10
        })
      } else if (completeTvFilter === '10+') {
        filtered = filtered.filter(reg => parseInt(reg.tv_no) > 10)
      }
    }

    // Person filter (Personal/Organization)
    if (completePersonFilter !== 'all') {
      filtered = filtered.filter(reg => reg.person === completePersonFilter)
    }

    // Approval filter
    if (completeApprovalFilter !== 'all') {
      if (completeApprovalFilter === 'unapproved') {
        filtered = filtered.filter(isUnapprovedRegistration)
      } else if (completeApprovalFilter === 'approved') {
        filtered = filtered.filter(reg => !isUnapprovedRegistration(reg))
      }
    }

    // Receipt filter
    if (completeReceiptFilter !== 'all') {
      if (completeReceiptFilter === 'completed') {
        filtered = filtered.filter(reg => reg.receipt_no && reg.receipt_no.toString().trim() !== '')
      } else if (completeReceiptFilter === 'incomplete') {
        filtered = filtered.filter(reg => !reg.receipt_no || reg.receipt_no.toString().trim() === '')
      }
    }

    // Amount filter
    if (completeAmountFilter !== 'all') {
      if (completeAmountFilter === 'completed') {
        filtered = filtered.filter(reg => reg.collected_amount && parseFloat(reg.collected_amount) > 0)
      } else if (completeAmountFilter === 'incomplete') {
        filtered = filtered.filter(reg => !reg.collected_amount || parseFloat(reg.collected_amount) <= 0)
      }
    }

    // Period filter
    filtered = applyPeriodFilter(filtered, completePeriod, completeStartDate, completeEndDate)

    setFilteredCompleteRegistrations(filtered)
  }

  const applyIncompleteFilters = () => {
    let filtered = [...incompleteRegistrations]

    // Staff filter
    filtered = filterBySelectedStaff(filtered)

    // Search filter
    if (incompleteSearchQuery) {
      const query = incompleteSearchQuery.toLowerCase()
      filtered = filtered.filter(reg =>
        reg.client_name?.toLowerCase().includes(query) ||
        reg.client_phone?.toLowerCase().includes(query) ||
        reg.kebele?.toLowerCase().includes(query) ||
        reg.house_no?.toLowerCase().includes(query)
      )
    }

    // TV filter
    if (incompleteTvFilter !== 'all') {
      if (incompleteTvFilter === '1') {
        filtered = filtered.filter(reg => parseInt(reg.tv_no) === 1)
      } else if (incompleteTvFilter === '2-5') {
        filtered = filtered.filter(reg => {
          const tvCount = parseInt(reg.tv_no)
          return tvCount >= 2 && tvCount <= 5
        })
      } else if (incompleteTvFilter === '6-10') {
        filtered = filtered.filter(reg => {
          const tvCount = parseInt(reg.tv_no)
          return tvCount >= 6 && tvCount <= 10
        })
      } else if (incompleteTvFilter === '10+') {
        filtered = filtered.filter(reg => parseInt(reg.tv_no) > 10)
      }
    }

    // Person filter (Personal/Organization)
    if (incompletePersonFilter !== 'all') {
      filtered = filtered.filter(reg => reg.person === incompletePersonFilter)
    }

    // Approval filter
    if (incompleteApprovalFilter !== 'all') {
      if (incompleteApprovalFilter === 'unapproved') {
        filtered = filtered.filter(isUnapprovedRegistration)
      } else if (incompleteApprovalFilter === 'approved') {
        filtered = filtered.filter(reg => !isUnapprovedRegistration(reg))
      }
    }

    // Receipt filter
    if (incompleteReceiptFilter !== 'all') {
      if (incompleteReceiptFilter === 'completed') {
        filtered = filtered.filter(reg => reg.receipt_no && reg.receipt_no.toString().trim() !== '')
      } else if (incompleteReceiptFilter === 'incomplete') {
        filtered = filtered.filter(reg => !reg.receipt_no || reg.receipt_no.toString().trim() === '')
      }
    }

    // Amount filter
    if (incompleteAmountFilter !== 'all') {
      if (incompleteAmountFilter === 'completed') {
        filtered = filtered.filter(reg => reg.collected_amount && parseFloat(reg.collected_amount) > 0)
      } else if (incompleteAmountFilter === 'incomplete') {
        filtered = filtered.filter(reg => !reg.collected_amount || parseFloat(reg.collected_amount) <= 0)
      }
    }

    // Period filter
    filtered = applyPeriodFilter(filtered, incompletePeriod, incompleteStartDate, incompleteEndDate)

    setFilteredIncompleteRegistrations(filtered)
  }

  const filterBySelectedStaff = registrations => {
    if (selectedStaff === 'all') return registrations
    const selectedStaffInfo = staffList.find(staff => String(staff.id ?? staff._id) === selectedStaff)
    if (!selectedStaffInfo) return []
    return registrations.filter(reg =>
      String(reg.staff_id ?? '') === selectedStaff ||
      (selectedStaffInfo.username &&
        String(reg.staff_username || '').toLowerCase() === String(selectedStaffInfo.username).toLowerCase())
    )
  }

  const applyPeriodFilter = (data, period, startDate, endDate) => {
    if (!period || period === 'all') return data

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    return data.filter(reg => {
      const regDate = new Date(reg.created_at || reg.registered_at)

      switch (period) {
        case 'today':
          return regDate >= today
        case 'thisweek': {
          const weekStart = new Date(today)
          weekStart.setDate(today.getDate() - today.getDay())
          return regDate >= weekStart
        }
        case 'lastweek': {
          const lastWeekStart = new Date(today)
          lastWeekStart.setDate(today.getDate() - today.getDay() - 7)
          const lastWeekEnd = new Date(lastWeekStart)
          lastWeekEnd.setDate(lastWeekStart.getDate() + 7)
          return regDate >= lastWeekStart && regDate < lastWeekEnd
        }
        case 'last10days': {
          const tenDaysAgo = new Date(today)
          tenDaysAgo.setDate(today.getDate() - 10)
          return regDate >= tenDaysAgo
        }
        case 'thismonth': {
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
          return regDate >= monthStart
        }
        case 'lastmonth': {
          const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
          const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1)
          return regDate >= lastMonthStart && regDate < lastMonthEnd
        }
        case 'yearly': {
          const yearStart = new Date(now.getFullYear(), 0, 1)
          return regDate >= yearStart
        }
        case 'custom': {
          if (startDate && endDate) {
            const start = new Date(startDate)
            const end = new Date(endDate)
            end.setHours(23, 59, 59, 999)
            return regDate >= start && regDate <= end
          }
          return true
        }
        default:
          return true
      }
    })
  }

  const startVoiceSearchComplete = () => {
    if (!recognitionCompleteRef.current) {
      showNotification('❌ Voice search not supported in this browser', 'error')
      return
    }
    
    try {
      recognitionCompleteRef.current.start()
      setIsListeningComplete(true)
      showNotification('🎤 Listening... Speak your search query', 'info')
    } catch (error) {
      console.error('Failed to start voice search:', error)
      setIsListeningComplete(false)
    }
  }

  const startVoiceSearchIncomplete = () => {
    if (!recognitionIncompleteRef.current) {
      showNotification('❌ Voice search not supported in this browser', 'error')
      return
    }
    
    try {
      recognitionIncompleteRef.current.start()
      setIsListeningIncomplete(true)
      showNotification('🎤 Listening... Speak your search query', 'info')
    } catch (error) {
      console.error('Failed to start voice search:', error)
      setIsListeningIncomplete(false)
    }
  }

  const loadData = async () => {
    try {
      const [regResponse, staffResponse] = await Promise.all([
        dataRegistrationAPI.getAllRegistrations(),
        userAPI.getAllUsers()
      ])

      if (staffResponse.success) {
        setStaffList(staffResponse.data)
      }

      if (regResponse.success) {
        const allRegistrations = regResponse.data
        
        console.log('📊 RESULT PAGE - All Registrations:', allRegistrations.length)

        // Complete: ONLY paid registrations (NOT UNAPPROVED STAFF)
        const complete = allRegistrations.filter(reg =>
          String(reg.payment_status || '').trim().toLowerCase() === 'paid' &&
          !isUnapprovedRegistration(reg)
        )
        
        console.log('✅ Complete (Paid) Registrations:', complete.length, complete)

        // Incomplete: from Unpaid page (payment_status = 'unpaid' AND NOT UNAPPROVED STAFF)
        const incomplete = allRegistrations.filter(reg =>
          String(reg.payment_status || '').trim().toLowerCase() === 'unpaid' &&
          !isUnapprovedRegistration(reg)
        )
        
        console.log('⏳ Incomplete (Unpaid) Registrations:', incomplete.length, incomplete)

        setCompleteRegistrations(complete)
        setIncompleteRegistrations(incomplete)

      }
    } catch (error) {
      console.error('Failed to load data:', error)
      showNotification('Failed to load data', 'error')
    } finally {
      setLoading(false)
    }
  }

  const calculateStats = (complete, incomplete) => {
    // Calculate statistics
    const totalComplete = complete.length
    const totalIncomplete = incomplete.length
    
    // Calculate earnings based on commission logic from Finance tab
    const totalEarned = calculateCommission(complete)
    const remainingEarn = calculateCommission(incomplete)

    setStats({
      totalComplete,
      totalIncomplete,
      totalEarned,
      remainingEarn
    })
  }

  // Calculate commission based on work type and user settings (same logic as Finance tab)
  const calculateCommission = (registrations) => {
    let commission = 0
    
    registrations.forEach(reg => {
      // Try to get commission from registration data first
      const regCommission = parseFloat(reg.user_commission_amount) || 0
      
      if (regCommission > 0) {
        commission += regCommission
      } else {
        // Calculate based on work type and TV count
        const workType = reg.work_type || ''
        const tvCount = parseInt(reg.tv_no) || 0
        
        // For REDSEA-EBC work type: 1 TV = 10 ETB
        if (workType.toLowerCase().includes('redsea') || workType.toLowerCase().includes('ebc')) {
          commission += tvCount * 10
        } else {
          // For other work types, use default 10% of paid amount
          const amount = parseFloat(reg.paid_amount) || 0
          commission += (amount * 10) / 100
        }
      }
    })

    return commission
  }

  const handleStaffChange = (e) => {
    setSelectedStaff(e.target.value)
  }

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type })
    setTimeout(() => setNotification(null), 3000)
  }

  const handleDownload = (format, section) => {
    const data = section === 'Complete' ? getFilteredComplete() : getFilteredIncomplete()
    const selectedStaffInfo = staffList.find(staff => String(staff.id ?? staff._id) === selectedStaff)
    const staffName = selectedStaff === 'all' ? 'All Staff' : selectedStaffInfo?.full_name || 'Unknown'
    
    if (format === 'Excel') {
      downloadExcel(data, section, staffName)
    } else if (format === 'Word') {
      downloadWord(data, section, staffName)
    } else if (format === 'PDF') {
      downloadPDF(data, section, staffName)
    }
  }

  const handlePrint = (section) => {
    const data = section === 'Complete' ? getFilteredComplete() : getFilteredIncomplete()
    const selectedStaffInfo = staffList.find(staff => String(staff.id ?? staff._id) === selectedStaff)
    const staffName = selectedStaff === 'all' ? 'All Staff' : selectedStaffInfo?.full_name || 'Unknown'
    printData(data, section, staffName)
  }

  const downloadExcel = (data, section, staffName) => {
    const schemaRows = completeRegistrations.concat(incompleteRegistrations)
    const worksheet = XLSX.utils.json_to_sheet(getRegistrationExportRows(data, schemaRows))
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, `${section} Registrations`)
    XLSX.writeFile(workbook, `REDSEA_${section}_Report_${new Date().toISOString().split('T')[0]}.xlsx`)
    showNotification(`✓ ${section} report downloaded for ${staffName}!`, 'success')
  }

  const downloadWord = (data, section, staffName) => {
    const schemaRows = completeRegistrations.concat(incompleteRegistrations)
    const rows = getRegistrationExportRows(data, schemaRows)
    const headers = Object.keys(rows[0] || getRegistrationExportRows([{}])[0])
    const escape = value => String(value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    // Create HTML content for Word
    let html = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word'>
      <head><meta charset='utf-8'><title>REDSEA Report</title></head>
      <body>
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #c41e3a; margin: 0;">REDSEA</h1>
          <p style="color: #666; margin: 5px 0;">fixed and movable Commission Work & Brokerage Services</p>
          <hr style="border: 2px solid #c41e3a; width: 200px;">
        </div>
        
        <h2 style="color: #2d3748;">${section} Registrations Report</h2>
        <p><strong>Staff:</strong> ${staffName}</p>
        <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
        <p><strong>Total Records:</strong> ${data.length}</p>
        
        <table border="1" cellpadding="8" cellspacing="0" style="width: 100%; border-collapse: collapse; margin-top: 20px;">
          <thead style="background-color: #c41e3a; color: white;">
            <tr>${headers.map(header => `<th>${escape(header)}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${rows.map(row => `<tr>${headers.map(header => `<td>${escape(row[header])}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `
    
    const blob = new Blob([html], { type: 'application/msword' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `REDSEA_${section}_Report_${new Date().toISOString().split('T')[0]}.doc`
    link.click()
    
    showNotification(`✓ ${section} report downloaded as Word!`, 'success')
  }

  const downloadPDF = (data, section, staffName) => {
    const doc = new jsPDF({ orientation: 'landscape' })
    
    // Add logo and header
    doc.setFontSize(18)
    doc.setTextColor(196, 30, 58)
    doc.text('REDSEA', 14, 15)
    
    doc.setFontSize(10)
    doc.setTextColor(100, 100, 100)
    doc.text('fixed and movable Commission Work & Brokerage Services', 14, 22)
    
    doc.setFontSize(14)
    doc.setTextColor(0, 0, 0)
    doc.text(`${section} Registrations Report`, 14, 32)
    
    doc.setFontSize(10)
    doc.text(`Staff: ${staffName}`, 14, 40)
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 46)
    doc.text(`Total Records: ${data.length}`, 14, 52)
    
    const schemaRows = completeRegistrations.concat(incompleteRegistrations)
    const rows = getRegistrationExportRows(data, schemaRows)
    const headers = Object.keys(rows[0] || getRegistrationExportRows([{}])[0])
    const tableData = rows.map(row => headers.map(header => row[header]))
    
    doc.autoTable({
      startY: 58,
      head: [headers],
      body: tableData,
      styles: { fontSize: 5, cellPadding: 1.5, overflow: 'linebreak' },
      headStyles: { fillColor: [196, 30, 58], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      margin: { top: 58 }
    })
    
    doc.save(`REDSEA_${section}_Report_${new Date().toISOString().split('T')[0]}.pdf`)
    showNotification(`✓ ${section} PDF downloaded!`, 'success')
  }

  const printData = (data, section, staffName) => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      showNotification('Allow pop-ups to print this report.', 'error')
      return
    }
    const schemaRows = completeRegistrations.concat(incompleteRegistrations)
    const rows = getRegistrationExportRows(data, schemaRows)
    const headers = Object.keys(rows[0] || getRegistrationExportRows([{}])[0])
    const escape = value => String(value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    printWindow.document.write(`
      <html>
      <head>
        <title>REDSEA ${section} Report</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .header h1 { color: #c41e3a; margin: 0; font-size: 2.5rem; }
          .header p { color: #666; margin: 5px 0; }
          .header hr { border: 2px solid #c41e3a; width: 200px; margin: 15px auto; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { background-color: #c41e3a; color: white; padding: 10px; text-align: left; }
          td { border: 1px solid #ddd; padding: 8px; }
          tr:nth-child(even) { background-color: #f9f9f9; }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>REDSEA</h1>
          <p>fixed and movable Commission Work & Brokerage Services</p>
          <hr>
        </div>
        
        <h2>${section} Registrations</h2>
        
        <table>
          <thead>
            <tr>${headers.map(header => `<th>${escape(header)}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${rows.map(row => `<tr>${headers.map(header => `<td>${escape(row[header])}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `)
    printWindow.document.close()
    
    // Auto-print after a short delay
    setTimeout(() => {
      printWindow.print()
    }, 500)
    
    showNotification(`✓ ${section} report sent to printer!`, 'success')
  }

  const getFilteredComplete = () => {
    return filteredCompleteRegistrations
  }

  const getFilteredIncomplete = () => {
    return filteredIncompleteRegistrations
  }

  return (
    <div className="result-page">
      <div className="result-container">
        {/* Header Section */}
        <div className="result-header">
          <h1 className="page-title">Result Report</h1>
          <p className="page-subtitle">Complete and Incomplete Registration Statistics</p>

          {/* Staff Filter */}
          <div className="staff-filter">
            <label htmlFor="staffFilter">
              <span className="label-icon">👤</span>
              Filter by Staff
            </label>
            <select
              id="staffFilter"
              value={selectedStaff}
              onChange={handleStaffChange}
              className="staff-select"
            >
              <option value="all">All Staff</option>
              {staffList.map(staff => (
                <option key={staff.id ?? staff._id} value={staff.id ?? staff._id}>
                  {staff.username} - {staff.full_name || 'N/A'}
                </option>
              ))}
            </select>
          </div>

          {/* Statistics Cards */}
          <div className="stats-grid">
            <div className="stat-card complete-card">
              <div className="stat-icon">✅</div>
              <div className="stat-content">
                <div className="stat-label">Total Complete</div>
                <div className="stat-value">{stats.totalComplete}</div>
              </div>
            </div>

            <div className="stat-card incomplete-card">
              <div className="stat-icon">⏳</div>
              <div className="stat-content">
                <div className="stat-label">Total Incomplete</div>
                <div className="stat-value">{stats.totalIncomplete}</div>
              </div>
            </div>

            <div className="stat-card earned-card">
              <div className="stat-icon">💰</div>
              <div className="stat-content">
                <div className="stat-label">Total Earned</div>
                <div className="stat-value">{stats.totalEarned} Birr</div>
              </div>
            </div>

            <div className="stat-card remaining-card">
              <div className="stat-icon">📊</div>
              <div className="stat-content">
                <div className="stat-label">Remaining Earn</div>
                <div className="stat-value">{stats.remainingEarn} Birr</div>
              </div>
            </div>
          </div>
        </div>

        {/* Body Section - Two Columns */}
        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading results...</p>
          </div>
        ) : (
          <div className="result-body">
            {/* Left Column - Complete List */}
            <div className="result-column complete-column">
              <div className="column-header">
                <h2 className="column-title">
                  <span className="title-icon">✅</span>
                  Complete Paid Report
                </h2>
                <div className="download-buttons">
                  <button
                    className="btn-download excel"
                    onClick={() => handleDownload('Excel', 'Complete')}
                    title="Download as Excel"
                  >
                    📊 Excel
                  </button>
                  <button
                    className="btn-download word"
                    onClick={() => handleDownload('Word', 'Complete')}
                    title="Download as Word"
                  >
                    📄 Word
                  </button>
                  <button
                    className="btn-download pdf"
                    onClick={() => handleDownload('PDF', 'Complete')}
                    title="Download as PDF"
                  >
                    📕 PDF
                  </button>
                  <button
                    className="btn-download print"
                    onClick={() => handlePrint('Complete')}
                    title="Print"
                  >
                    🖨️ Print
                  </button>
                </div>
              </div>

              {/* Search and Filter for Complete */}
              <div className="filters-section-compact">
                <div className="search-box-compact">
                  <span className="search-icon">🔍</span>
                  <input
                    type="text"
                    placeholder="Search..."
                    value={completeSearchQuery}
                    onChange={(e) => setCompleteSearchQuery(e.target.value)}
                    className="search-input-compact"
                  />
                  <button
                    type="button"
                    className={`voice-search-btn ${isListeningComplete ? 'listening' : ''}`}
                    onClick={startVoiceSearchComplete}
                    title="Voice search"
                  >
                    🎤
                  </button>
                </div>
                
                <div className="filter-controls-compact">
                  <select
                    value={completePeriod}
                    onChange={(e) => setCompletePeriod(e.target.value)}
                    className="filter-select-compact"
                    title="Date Filter"
                  >
                    <option value="all">All Time</option>
                    <option value="today">Today</option>
                    <option value="thisweek">This Week</option>
                    <option value="lastweek">Last Week</option>
                    <option value="last10days">Last 10 Days</option>
                    <option value="thismonth">This Month</option>
                    <option value="lastmonth">Last Month</option>
                    <option value="yearly">This Year</option>
                    <option value="custom">Custom</option>
                  </select>

                  <select
                    value={completeTvFilter}
                    onChange={(e) => setCompleteTvFilter(e.target.value)}
                    className="filter-select-compact"
                    title="TV Count Filter"
                  >
                    <option value="all">All TV</option>
                    <option value="1">1 TV</option>
                    <option value="2-5">2-5 TV</option>
                    <option value="6-10">6-10 TV</option>
                    <option value="10+">10+ TV</option>
                  </select>

                  <select
                    value={completePersonFilter}
                    onChange={(e) => setCompletePersonFilter(e.target.value)}
                    className="filter-select-compact"
                    title="Person Type Filter"
                  >
                    <option value="all">All Types</option>
                    <option value="personal">Personal</option>
                    <option value="organization">Organization</option>
                  </select>

                  <select
                    value={completeApprovalFilter}
                    onChange={(e) => setCompleteApprovalFilter(e.target.value)}
                    className="filter-select-compact"
                    title="Approval Status Filter"
                  >
                    <option value="all">All Status</option>
                    <option value="unapproved">Unapproved Staff</option>
                    <option value="approved">Approved</option>
                  </select>

                  <select
                    value={completeReceiptFilter}
                    onChange={(e) => setCompleteReceiptFilter(e.target.value)}
                    className="filter-select-compact"
                    title="Receipt Status Filter"
                  >
                    <option value="all">All Receipt</option>
                    <option value="completed">Receipt Complete</option>
                    <option value="incomplete">Receipt Incomplete</option>
                  </select>

                  <select
                    value={completeAmountFilter}
                    onChange={(e) => setCompleteAmountFilter(e.target.value)}
                    className="filter-select-compact"
                    title="Amount Status Filter"
                  >
                    <option value="all">All Amount</option>
                    <option value="completed">Amount Complete</option>
                    <option value="incomplete">Amount Incomplete</option>
                  </select>

                  {completePeriod === 'custom' && (
                    <>
                      <input
                        type="date"
                        value={completeStartDate}
                        onChange={(e) => setCompleteStartDate(e.target.value)}
                        className="filter-date-compact"
                      />
                      <input
                        type="date"
                        value={completeEndDate}
                        onChange={(e) => setCompleteEndDate(e.target.value)}
                        className="filter-date-compact"
                      />
                    </>
                  )}

                  <span className="results-count-compact">
                    {filteredCompleteRegistrations.length} of {completeRegistrations.length}
                  </span>
                  <span className="page-size-control">Maximum 25 rows per page</span>
                </div>
              </div>

              <div className="column-content">
                {filteredCompleteRegistrations.length === 0 ? (
                  <div className="empty-message">
                    <span className="empty-icon">🔍</span>
                    <p>No results found</p>
                  </div>
                ) : (
                  <table className="result-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Status</th>
                        <th>Client Name</th>
                        <th>Phone</th>
                        <th>Kebele</th>
                        <th>House No</th>
                        <th>TV No</th>
                        <th>Staff</th>
                        <th>Gov Letter</th>
                        <th>Payment</th>
                        <th>Valid Date</th>
                        <th>Date</th>
                        <th>More</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCompleteRegistrations
                        .slice((completeCurrentPage - 1) * completeItemsPerPage, completeCurrentPage * completeItemsPerPage)
                        .map((reg, index) => {
                          const globalIndex = (completeCurrentPage - 1) * completeItemsPerPage + index
                          return (
                        <tr key={reg.id}>
                          <td>{globalIndex + 1}</td>
                          <td>
                            <span className="status-badge paid-badge">PAID</span>
                          </td>
                          <td>{reg.client_name}</td>
                          <td>
                            <a href={`tel:${reg.client_phone}`} className="phone-link">
                              {reg.client_phone}
                            </a>
                          </td>
                          <td>{reg.kebele}</td>
                          <td>{reg.house_no || 'N/A'}</td>
                          <td>{reg.tv_no} TV</td>
                          <td>{getRegistrationStaffLabel(reg)}</td>
                          <td>
                            <span className={`badge-gov-compact ${reg.gov_letter === 'accept' ? 'accepted' : 'unaccepted'}`}>
                              {reg.gov_letter || 'N/A'}
                            </span>
                          </td>
                          <td>
                            {reg.paid_amount ? (
                              <span className="payment-badge">{reg.paid_amount} Birr</span>
                            ) : (
                              <span className="no-payment-badge">N/A</span>
                            )}
                          </td>
                          <td>
                            {reg.registration_datetime ? (
                              <span className="badge-date-compact">
                                {new Date(reg.registration_datetime).toLocaleDateString()}
                              </span>
                            ) : (
                              <span className="badge-no-date-compact">N/A</span>
                            )}
                          </td>
                          <td>{new Date(reg.registered_at).toLocaleDateString()}</td>
                          <td>
                            <button type="button" className="result-more-button" onClick={() => setDocumentsRegistration(reg)}>
                              More
                            </button>
                          </td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                )}
              </div>
              
              {/* Pagination for Complete */}
              {filteredCompleteRegistrations.length > completeItemsPerPage && (
                <div className="pagination-controls">
                  <button
                    className="pagination-btn"
                    onClick={() => setCompleteCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={completeCurrentPage === 1}
                  >
                    ← Previous
                  </button>
                  <span className="pagination-info">
                    Page {completeCurrentPage} of {Math.ceil(filteredCompleteRegistrations.length / completeItemsPerPage)}
                    ({(completeCurrentPage - 1) * completeItemsPerPage + 1}-{Math.min(completeCurrentPage * completeItemsPerPage, filteredCompleteRegistrations.length)} of {filteredCompleteRegistrations.length})
                  </span>
                  <button
                    className="pagination-btn"
                    onClick={() => setCompleteCurrentPage(prev => Math.min(Math.ceil(filteredCompleteRegistrations.length / completeItemsPerPage), prev + 1))}
                    disabled={completeCurrentPage >= Math.ceil(filteredCompleteRegistrations.length / completeItemsPerPage)}
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>

            {/* Right Column - Incomplete List */}
            <div className="result-column incomplete-column">
              <div className="column-header">
                <h2 className="column-title">
                  <span className="title-icon">⏳</span>
                  Incomplete Unpaid Report
                </h2>
                <div className="download-buttons">
                  <button
                    className="btn-download excel"
                    onClick={() => handleDownload('Excel', 'Incomplete')}
                    title="Download as Excel"
                  >
                    📊 Excel
                  </button>
                  <button
                    className="btn-download word"
                    onClick={() => handleDownload('Word', 'Incomplete')}
                    title="Download as Word"
                  >
                    📄 Word
                  </button>
                  <button
                    className="btn-download pdf"
                    onClick={() => handleDownload('PDF', 'Incomplete')}
                    title="Download as PDF"
                  >
                    📕 PDF
                  </button>
                  <button
                    className="btn-download print"
                    onClick={() => handlePrint('Incomplete')}
                    title="Print"
                  >
                    🖨️ Print
                  </button>
                </div>
              </div>

              {/* Search and Filter for Incomplete */}
              <div className="filters-section-compact">
                <div className="search-box-compact">
                  <span className="search-icon">🔍</span>
                  <input
                    type="text"
                    placeholder="Search..."
                    value={incompleteSearchQuery}
                    onChange={(e) => setIncompleteSearchQuery(e.target.value)}
                    className="search-input-compact"
                  />
                  <button
                    type="button"
                    className={`voice-search-btn ${isListeningIncomplete ? 'listening' : ''}`}
                    onClick={startVoiceSearchIncomplete}
                    title="Voice search"
                  >
                    🎤
                  </button>
                </div>
                
                <div className="filter-controls-compact">
                  <select
                    value={incompletePeriod}
                    onChange={(e) => setIncompletePeriod(e.target.value)}
                    className="filter-select-compact"
                    title="Date Filter"
                  >
                    <option value="all">All Time</option>
                    <option value="today">Today</option>
                    <option value="thisweek">This Week</option>
                    <option value="lastweek">Last Week</option>
                    <option value="last10days">Last 10 Days</option>
                    <option value="thismonth">This Month</option>
                    <option value="lastmonth">Last Month</option>
                    <option value="yearly">This Year</option>
                    <option value="custom">Custom</option>
                  </select>

                  <select
                    value={incompleteTvFilter}
                    onChange={(e) => setIncompleteTvFilter(e.target.value)}
                    className="filter-select-compact"
                    title="TV Count Filter"
                  >
                    <option value="all">All TV</option>
                    <option value="1">1 TV</option>
                    <option value="2-5">2-5 TV</option>
                    <option value="6-10">6-10 TV</option>
                    <option value="10+">10+ TV</option>
                  </select>

                  <select
                    value={incompletePersonFilter}
                    onChange={(e) => setIncompletePersonFilter(e.target.value)}
                    className="filter-select-compact"
                    title="Person Type Filter"
                  >
                    <option value="all">All Types</option>
                    <option value="personal">Personal</option>
                    <option value="organization">Organization</option>
                  </select>

                  <select
                    value={incompleteApprovalFilter}
                    onChange={(e) => setIncompleteApprovalFilter(e.target.value)}
                    className="filter-select-compact"
                    title="Approval Status Filter"
                  >
                    <option value="all">All Status</option>
                    <option value="unapproved">Unapproved Staff</option>
                    <option value="approved">Approved</option>
                  </select>

                  <select
                    value={incompleteReceiptFilter}
                    onChange={(e) => setIncompleteReceiptFilter(e.target.value)}
                    className="filter-select-compact"
                    title="Receipt Status Filter"
                  >
                    <option value="all">All Receipt</option>
                    <option value="completed">Receipt Complete</option>
                    <option value="incomplete">Receipt Incomplete</option>
                  </select>

                  <select
                    value={incompleteAmountFilter}
                    onChange={(e) => setIncompleteAmountFilter(e.target.value)}
                    className="filter-select-compact"
                    title="Amount Status Filter"
                  >
                    <option value="all">All Amount</option>
                    <option value="completed">Amount Complete</option>
                    <option value="incomplete">Amount Incomplete</option>
                  </select>

                  {incompletePeriod === 'custom' && (
                    <>
                      <input
                        type="date"
                        value={incompleteStartDate}
                        onChange={(e) => setIncompleteStartDate(e.target.value)}
                        className="filter-date-compact"
                      />
                      <input
                        type="date"
                        value={incompleteEndDate}
                        onChange={(e) => setIncompleteEndDate(e.target.value)}
                        className="filter-date-compact"
                      />
                    </>
                  )}

                  <span className="results-count-compact">
                    {filteredIncompleteRegistrations.length} of {incompleteRegistrations.length}
                  </span>
                  <span className="page-size-control">Maximum 25 rows per page</span>
                </div>
              </div>

              <div className="column-content">
                {filteredIncompleteRegistrations.length === 0 ? (
                  <div className="empty-message">
                    <span className="empty-icon">🔍</span>
                    <p>No results found</p>
                  </div>
                ) : (
                  <table className="result-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Status</th>
                        <th>Client Name</th>
                        <th>Phone</th>
                        <th>Kebele</th>
                        <th>House No</th>
                        <th>TV No</th>
                        <th>Staff</th>
                        <th>Gov Letter</th>
                        <th>Payment</th>
                        <th>Valid Date</th>
                        <th>Date</th>
                        <th>More</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredIncompleteRegistrations
                        .slice((incompleteCurrentPage - 1) * incompleteItemsPerPage, incompleteCurrentPage * incompleteItemsPerPage)
                        .map((reg, index) => {
                          const globalIndex = (incompleteCurrentPage - 1) * incompleteItemsPerPage + index
                          return (
                        <tr key={reg.id}>
                          <td>{globalIndex + 1}</td>
                          <td>
                            <span className="status-badge unpaid-badge">UNPAID</span>
                          </td>
                          <td>{reg.client_name}</td>
                          <td>
                            <a href={`tel:${reg.client_phone}`} className="phone-link">
                              {reg.client_phone}
                            </a>
                          </td>
                          <td>{reg.kebele}</td>
                          <td>{reg.house_no || 'N/A'}</td>
                          <td>{reg.tv_no} TV</td>
                          <td>{getRegistrationStaffLabel(reg)}</td>
                          <td>
                            <span className={`badge-gov-compact ${reg.gov_letter === 'accept' ? 'accepted' : 'unaccepted'}`}>
                              {reg.gov_letter || 'N/A'}
                            </span>
                          </td>
                          <td>
                            {reg.paid_amount ? (
                              <span className="payment-badge">{reg.paid_amount} Birr</span>
                            ) : (
                              <span className="no-payment-badge">N/A</span>
                            )}
                          </td>
                          <td>
                            {reg.registration_datetime ? (
                              <span className="badge-date-compact">
                                {new Date(reg.registration_datetime).toLocaleDateString()}
                              </span>
                            ) : (
                              <span className="badge-no-date-compact">N/A</span>
                            )}
                          </td>
                          <td>{new Date(reg.registered_at).toLocaleDateString()}</td>
                          <td>
                            <button type="button" className="result-more-button" onClick={() => setDocumentsRegistration(reg)}>
                              More
                            </button>
                          </td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                )}
              </div>
              
              {/* Pagination for Incomplete */}
              {filteredIncompleteRegistrations.length > incompleteItemsPerPage && (
                <div className="pagination-controls">
                  <button
                    className="pagination-btn"
                    onClick={() => setIncompleteCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={incompleteCurrentPage === 1}
                  >
                    ← Previous
                  </button>
                  <span className="pagination-info">
                    Page {incompleteCurrentPage} of {Math.ceil(filteredIncompleteRegistrations.length / incompleteItemsPerPage)}
                    ({(incompleteCurrentPage - 1) * incompleteItemsPerPage + 1}-{Math.min(incompleteCurrentPage * incompleteItemsPerPage, filteredIncompleteRegistrations.length)} of {filteredIncompleteRegistrations.length})
                  </span>
                  <button
                    className="pagination-btn"
                    onClick={() => setIncompleteCurrentPage(prev => Math.min(Math.ceil(filteredIncompleteRegistrations.length / incompleteItemsPerPage), prev + 1))}
                    disabled={incompleteCurrentPage >= Math.ceil(filteredIncompleteRegistrations.length / incompleteItemsPerPage)}
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {documentsRegistration && (
        <RegistrationDocumentsModal
          registration={documentsRegistration}
          registrations={[...completeRegistrations, ...incompleteRegistrations]}
          onClose={() => setDocumentsRegistration(null)}
        />
      )}

      {/* Toast Notification */}
      {notification && (
        <div className={`toast-notification ${notification.type}`}>
          <span className="toast-message">{notification.message}</span>
        </div>
      )}
    </div>
  )
}

export default Result
