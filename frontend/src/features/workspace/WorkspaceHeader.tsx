import { KnarraMark } from '../../components/KnarraMark'
import { HelpIcon, SettingsIcon } from '../../components/icons'
import { ACCOUNT } from './data'
import type { InfoDialogKind } from './types'
import styles from './Workspace.module.css'

type WorkspaceHeaderProps = {
  productName: string
  helpOpen: boolean
  accountOpen: boolean
  onToggleHelp: () => void
  onToggleAccount: () => void
  onGoProjects: () => void
  onOpenSettings: () => void
  onShowInfo: (kind: InfoDialogKind) => void
}

const HELP_ITEMS: { id: InfoDialogKind; label: string }[] = [
  { id: 'start', label: 'Getting started' },
  { id: 'keys', label: 'Keyboard shortcuts' },
  { id: 'feedback', label: 'Send feedback' },
]

export function WorkspaceHeader({
  productName,
  helpOpen,
  accountOpen,
  onToggleHelp,
  onToggleAccount,
  onGoProjects,
  onOpenSettings,
  onShowInfo,
}: WorkspaceHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <button type="button" className={styles.brand} aria-label="Go to projects" onClick={onGoProjects}>
          <span className={styles.brandTile}>
            <KnarraMark size={22} />
          </span>
          <span className={styles.wordmark}>{productName}</span>
        </button>

        <div className={styles.headerActions}>
          <div className={styles.popoverAnchor}>
            <button
              type="button"
              title="Help"
              aria-label="Help"
              aria-haspopup="menu"
              aria-expanded={helpOpen}
              className={[styles.iconButton, helpOpen && styles.iconButtonOpen].filter(Boolean).join(' ')}
              onClick={onToggleHelp}
            >
              <HelpIcon size={19} />
            </button>
            {helpOpen && (
              <div role="menu" aria-label="Help" className={styles.menu} style={{ width: 232 }}>
                <div className={styles.menuLabel}>Help</div>
                {HELP_ITEMS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    className={styles.menuItem}
                    onClick={() => onShowInfo(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            title="Settings"
            aria-label="Settings"
            className={styles.iconButton}
            onClick={onOpenSettings}
          >
            <SettingsIcon size={19} />
          </button>

          <div className={styles.popoverAnchor}>
            <button
              type="button"
              title={ACCOUNT.name}
              aria-label={`Account menu for ${ACCOUNT.name}`}
              aria-haspopup="menu"
              aria-expanded={accountOpen}
              className={styles.avatar}
              onClick={onToggleAccount}
            >
              {ACCOUNT.initials}
            </button>
            {accountOpen && (
              <div role="menu" aria-label="Account" className={styles.menu} style={{ width: 226 }}>
                <div className={styles.menuHeader}>{ACCOUNT.name}</div>
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => onShowInfo('profile')}
                >
                  Profile
                </button>
                <button type="button" role="menuitem" className={styles.menuItem} onClick={onOpenSettings}>
                  Settings
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={[styles.menuItem, styles.menuItemDivided, styles.menuItemDanger].join(' ')}
                  onClick={() => onShowInfo('signout')}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
