import { CheckIcon, CloseIcon, GridIcon, ListIcon, SearchIcon, SortIcon } from '../../components/icons'
import { FILTERS, SORTS } from './data'
import type { FilterKey, SortKey, ViewMode } from './types'
import styles from './Workspace.module.css'

type WorkspaceToolbarProps = {
  query: string
  filter: FilterKey
  sort: SortKey
  sortOpen: boolean
  view: ViewMode
  onQueryChange: (value: string) => void
  onClearQuery: () => void
  onFilterChange: (filter: FilterKey) => void
  onToggleSort: () => void
  onSortChange: (sort: SortKey) => void
  onViewChange: (view: ViewMode) => void
}

export function WorkspaceToolbar({
  query,
  filter,
  sort,
  sortOpen,
  view,
  onQueryChange,
  onClearQuery,
  onFilterChange,
  onToggleSort,
  onSortChange,
  onViewChange,
}: WorkspaceToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.toolbarLeft}>
        <div className={styles.search}>
          <SearchIcon size={18} className={styles.searchIcon} />
          <input
            type="text"
            aria-label="Search projects"
            placeholder="Search projects"
            className={styles.searchInput}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
          {query.length > 0 && (
            <button
              type="button"
              aria-label="Clear search"
              title="Clear search"
              className={styles.searchClear}
              onClick={onClearQuery}
            >
              <CloseIcon size={15} />
            </button>
          )}
        </div>

        <div role="group" aria-label="Filter projects" className={styles.segmentGroup}>
          {FILTERS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={filter === option}
              className={[styles.segment, filter === option && styles.segmentActive].filter(Boolean).join(' ')}
              onClick={() => onFilterChange(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.toolbarRight}>
        <div className={styles.popoverAnchor}>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={sortOpen}
            className={styles.sortButton}
            onClick={onToggleSort}
          >
            <SortIcon size={17} className={styles.sortIcon} />
            <span>{sort}</span>
          </button>
          {sortOpen && (
            <div role="menu" aria-label="Sort projects" className={styles.menu} style={{ width: 196, zIndex: 30 }}>
              {SORTS.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="menuitem"
                  className={[
                    styles.menuItem,
                    styles.menuItemSplit,
                    sort === option && styles.menuItemActive,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => onSortChange(option)}
                >
                  <span>{option}</span>
                  {sort === option && <CheckIcon size={16} style={{ color: 'var(--ws-brand)' }} />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div role="group" aria-label="View" className={styles.viewGroup}>
          <button
            type="button"
            title="Grid view"
            aria-label="Grid view"
            aria-pressed={view === 'grid'}
            className={[styles.viewButton, view === 'grid' && styles.viewButtonActive].filter(Boolean).join(' ')}
            onClick={() => onViewChange('grid')}
          >
            <GridIcon size={17} />
          </button>
          <button
            type="button"
            title="List view"
            aria-label="List view"
            aria-pressed={view === 'list'}
            className={[styles.viewButton, view === 'list' && styles.viewButtonActive].filter(Boolean).join(' ')}
            onClick={() => onViewChange('list')}
          >
            <ListIcon size={17} />
          </button>
        </div>
      </div>
    </div>
  )
}
