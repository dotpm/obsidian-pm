import {
  App,
  ButtonComponent,
  Component,
  ExtraButtonComponent,
  Keymap,
  type KeymapEventHandler,
  Menu,
  MarkdownRenderer,
  Notice,
  type Scope,
  setIcon,
  setTooltip
} from 'obsidian'
import type PMPlugin from '#main'
import {
  type Project,
  type Task,
  makeTask,
  flattenTasks,
  getDefaultStatusId,
  getDefaultPriorityId,
  getPriorityConfig,
  t
} from '@dotpm/core'
import { TaskFileNameConflictError } from '#store'
import { Popover, safeAsync, renderGlyph } from '@dotpm/ui'
import { saveShortcutLabel } from '../utils'
import { confirmDialog, openTaskByPath } from '#ui/ModalFactory'
import { renderTaskFormFields } from './TaskFormFields'
import { renderTimeTrackingPanel } from './TimeTrackingPanel'
import { renderSubtasksPanel } from './SubtasksPanel'
import { NoteLinkSuggest } from './NoteLinkSuggest'

/** What the editor needs from whatever surface hosts it: a modal, a tab. */
export interface TaskEditorHost {
  surface: 'modal' | 'tab'
  close: () => void
  /** Keymap scope the save shortcut is registered on. */
  scope: Scope
}

export class TaskEditor {
  private task: Task
  /** The task as it was when the editor opened, to diff against on save. */
  private original: Task
  private isNew: boolean
  private originalParentId: string | null
  private cancelled = false
  private saved = false
  private persistPromise: Promise<void> | null = null
  private noteSuggest: NoteLinkSuggest | null = null
  private descResizeObserver: ResizeObserver | null = null
  private shownExtras = new Set<string>()
  private saveKeyHandler: KeymapEventHandler | null = null
  private escapeKeyHandler: KeymapEventHandler | null = null
  private containerEl: HTMLElement | null = null
  private titleInput: HTMLTextAreaElement | null = null

  constructor(
    private app: App,
    private plugin: PMPlugin,
    private project: Project,
    task: Task | null,
    private parentId: string | null,
    private onSave: (task: Task) => void | Promise<void>,
    private host: TaskEditorHost,
    defaults?: Partial<Task>
  ) {
    if (task) {
      this.task = JSON.parse(JSON.stringify(task)) as Task
      this.isNew = false
      if (parentId == null) {
        const flat = flattenTasks(project.tasks)
        const entry = flat.find((f) => f.task.id === task.id)
        this.parentId = entry?.parentId ?? null
      }
    } else {
      const config = plugin.store.configFor(project)
      this.task = makeTask({
        status: getDefaultStatusId(config.statuses),
        priority: getDefaultPriorityId(config.priorities),
        type: parentId ? 'subtask' : 'task',
        ...defaults
      })
      this.isNew = true
    }
    this.original = JSON.parse(JSON.stringify(this.task)) as Task
    this.originalParentId = this.parentId
  }

  get title(): string {
    return this.task.title
  }

  mount(container: HTMLElement): void {
    this.containerEl = container
    container.addEventListener('keydown', this.onTabKey)
    this.escapeKeyHandler = this.host.scope.register([], 'Escape', () => {
      const modal = this.containerEl?.closest<HTMLElement>('.modal')
      if (modal && Popover.closeWithin(modal)) return false
      return true
    })
    this.render()
    this.focusTitle()
  }

  private focusTitle(): void {
    window.setTimeout(() => {
      const input = this.titleInput
      if (!input) return
      input.focus()
      if (this.isNew) input.select()
    }, 0)
  }

  handleClose(): void {
    if (
      this.plugin.settings.saveTaskOnClose &&
      !this.isNew &&
      !this.cancelled &&
      !this.saved &&
      this.task.title.trim()
    ) {
      const conflict = this.plugin.store.findTaskFileConflict(this.project, this.task)
      if (conflict) {
        new Notice(t('taskEditor.notSavedConflict', { name: conflict.fileName }))
      } else {
        void this.persistTask()
      }
    }
    if (this.saveKeyHandler) {
      this.host.scope.unregister(this.saveKeyHandler)
      this.saveKeyHandler = null
    }
    if (this.escapeKeyHandler) {
      this.host.scope.unregister(this.escapeKeyHandler)
      this.escapeKeyHandler = null
    }
    this.containerEl?.removeEventListener('keydown', this.onTabKey)
    this.noteSuggest?.destroy()
    this.noteSuggest = null
    this.descResizeObserver?.disconnect()
    this.descResizeObserver = null
    this.containerEl?.empty()
  }

  private persistTask(): Promise<void> {
    if (this.persistPromise) return this.persistPromise
    const p = (async () => {
      try {
        await this.runPersist()
      } catch (err) {
        this.persistPromise = null
        throw err
      }
    })()
    this.persistPromise = p
    return p
  }

  private async insertAttachments(
    descArea: HTMLTextAreaElement,
    items: { blob: Blob; name: string }[],
    autoResize: () => void
  ): Promise<void> {
    for (const { blob, name } of items) {
      try {
        const buffer = await blob.arrayBuffer()
        const file = await this.plugin.store.saveTaskAttachment(this.project, this.task, name, buffer)
        const snippet = `![[${file.name}]]`
        descArea.setRangeText(snippet, descArea.selectionStart, descArea.selectionEnd, 'end')
        this.task.description = descArea.value
        autoResize()
      } catch (err) {
        console.error('Failed to save attachment', err)
        new Notice(t('taskEditor.attachmentFailed'))
      }
    }
  }

  /**
   * Only what changed. The editor works on a copy taken when it opened, so saving the
   * whole task would write its stale view of every other field back over disk.
   */
  private changedFields(): Partial<Task> {
    const patch: Partial<Task> = {}
    for (const key of Object.keys(this.task) as (keyof Task)[]) {
      if (JSON.stringify(this.task[key]) !== JSON.stringify(this.original[key])) {
        Object.assign(patch, { [key]: this.task[key] })
      }
    }
    return patch
  }

  private async runPersist(): Promise<void> {
    if (this.isNew) {
      await this.plugin.store.insertTask(this.project, this.task, this.parentId)
    } else {
      const patch = this.changedFields()
      const moved = this.parentId !== this.originalParentId
      if (Object.keys(patch).length === 0 && !moved) return
      await this.plugin.store.updateTask(this.project, this.task.id, patch)
      if (moved) await this.plugin.store.moveTask(this.project, this.task.id, this.parentId)
    }
    await this.plugin.store.scheduleAfterChange(this.project, this.task.id)
    await this.onSave(this.task)
  }

  /**
   * Follows a link out of the editor. A modal closes first so it isn't left covering the note,
   * and its edits are kept or dropped by the save-on-close setting; a link opened in a new tab
   * leaves it open and the page it covers stays active, so the new tab opens in the background.
   */
  private async openNote(link: string, event?: MouseEvent): Promise<void> {
    const paneType = event ? Keymap.isModEvent(event) : false
    const modal = this.host.surface === 'modal'
    if (modal && !paneType) this.leave()
    const covered = modal && paneType ? this.app.workspace.getMostRecentLeaf() : null
    const sourcePath = this.task.filePath || this.project.filePath || ''
    await this.app.workspace.openLinkText(link, sourcePath, paneType)
    if (covered) this.app.workspace.setActiveLeaf(covered, { focus: false })
  }

  /** A dependency leads to that task's editor, not to the markdown behind it. */
  private openLinkedTask(filePath: string): void {
    this.leave()
    void openTaskByPath(this.plugin, filePath)
  }

  private leave(): void {
    this.saved = false
    this.cancelled = false
    this.host.close()
  }

  private openOverflowMenu(anchorEl: HTMLElement): void {
    const menu = new Menu()
    if (this.task.filePath) {
      const filePath = this.task.filePath
      if (this.host.surface === 'modal') {
        menu.addItem((item) =>
          item
            .setTitle(t('taskEditor.openInTab'))
            .setIcon('maximize-2')
            .onClick(
              // Moving the editor is not cancelling it, so the edits go with it.
              safeAsync(async () => {
                await this.persistTask()
                this.saved = true
                this.host.close()
                await this.plugin.router.openTask({ filePath })
              })
            )
        )
      }
      menu.addItem((item) =>
        item
          .setTitle(t('taskEditor.openAsNote'))
          .setIcon('file-text')
          .onClick(() => {
            this.saved = false
            this.cancelled = false
            this.host.close()
            void this.plugin.openAsMarkdown(filePath)
          })
      )
      menu.addSeparator()
    }
    if (this.task.archived) {
      menu.addItem((item) =>
        item
          .setTitle(t('common.unarchive'))
          .setIcon('archive-restore')
          .onClick(
            safeAsync(async () => {
              await this.plugin.store.unarchiveTask(this.project, this.task.id)
              new Notice(t('task.unarchived'))
              await this.onSave(this.task)
              this.cancelled = true
              this.host.close()
            })
          )
      )
    } else {
      menu.addItem((item) =>
        item
          .setTitle(t('common.archive'))
          .setIcon('archive')
          .onClick(
            safeAsync(async () => {
              await this.plugin.store.archiveTask(this.project, this.task.id)
              new Notice(t('task.archived'))
              await this.onSave(this.task)
              this.cancelled = true
              this.host.close()
            })
          )
      )
    }
    menu.addItem((item) =>
      item
        .setTitle(t('common.delete'))
        .setIcon('trash-2')
        .setWarning(true)
        .onClick(
          safeAsync(async () => {
            if (await confirmDialog(this.app, t('task.deleteConfirm', { title: this.task.title }))) {
              await this.plugin.store.deleteTask(this.project, this.task.id)
              await this.onSave(this.task)
              this.cancelled = true
              this.host.close()
            }
          })
        )
    )
    const rect = anchorEl.getBoundingClientRect()
    menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 })
  }

  /** Every visible main control, in reading order. Chips and preview links stay out. */
  private tabTargets(): HTMLElement[] {
    const root = this.containerEl
    if (!root) return []
    return Array.from(
      root.querySelectorAll<HTMLElement>(
        'button, input, textarea, select, a[href], [contenteditable="true"], [tabindex]'
      )
    ).filter((el) => {
      if (el.tabIndex < 0 || el.hasAttribute('disabled')) return false
      if (el.getAttribute('aria-hidden') === 'true') return false
      if (el.closest('.pm-pop, .suggestion-container, .pm-hidden, .pm-chip')) return false
      if (el.closest('.pm-modal-desc-preview') && !el.classList.contains('pm-modal-desc-preview')) return false
      if (typeof el.checkVisibility === 'function') return el.checkVisibility()
      return el.offsetParent !== null || el.getClientRects().length > 0
    })
  }

  /**
   * Tabs through the property form itself. Native Tab drops keys when a blur rebuilds the
   * form or hides the description; this keeps each press one deterministic move.
   */
  private onTabKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab' || event.defaultPrevented) return
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const target = event.target as HTMLElement | null
    if (target?.closest('.pm-pop, .suggestion-container')) return
    const targets = this.tabTargets()
    if (!targets.length) return
    const current = activeDocument.activeElement as HTMLElement | null
    let index = current ? targets.indexOf(current) : -1
    if (index === -1) {
      if (current) {
        const following = targets.find(
          (el) => (current.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
        )
        index = following ? targets.indexOf(following) - (event.shiftKey ? 1 : 0) : event.shiftKey ? targets.length : -1
      } else {
        index = event.shiftKey ? targets.length : -1
      }
    }
    const nextIndex = (index + (event.shiftKey ? -1 : 1) + targets.length) % targets.length
    event.preventDefault()
    event.stopPropagation()
    targets[nextIndex].focus()
    // A blur can rebuild the form (an inline edit saved, say). Put focus back on the
    // nearest control if the target was replaced underneath us.
    window.setTimeout(() => {
      if (!this.containerEl?.isConnected) return
      const active = activeDocument.activeElement
      if (active && active !== activeDocument.body) return
      const after = this.tabTargets()
      if (after.length) after[Math.min(Math.max(nextIndex, 0), after.length - 1)]?.focus()
    }, 0)
  }

  /**
   * A property change rebuilds the whole form, which destroys the control that had focus
   * (a select's trigger, say). Focus goes back to the control in the same place.
   */
  private renderKeepingFocus(): void {
    const active = activeDocument.activeElement as HTMLElement | null
    const index = active ? this.tabTargets().indexOf(active) : -1
    this.render()
    if (index === -1) return
    this.tabTargets()[index]?.focus()
  }

  private render(): void {
    const contentEl = this.containerEl
    if (!contentEl) return
    contentEl.empty()

    const header = contentEl.createDiv('pm-te-header')
    const prio = getPriorityConfig(this.plugin.store.configFor(this.project).priorities, this.task.priority)
    if (prio?.color) header.setCssProps({ '--pm-accent-strip': prio.color })
    const crumb = header.createDiv('pm-te-crumb')
    if (this.project.icon) {
      renderGlyph(crumb.createSpan({ cls: 'pm-te-crumb-icon' }), { icon: this.project.icon })
    }
    crumb.createSpan({ cls: 'pm-te-crumb-name', text: this.project.title })
    const crumbSep = crumb.createSpan({ cls: 'pm-te-crumb-sep' })
    setIcon(crumbSep, 'chevron-right')
    const idEl = crumb.createSpan({ cls: 'pm-te-crumb-id pm-te-copyable', text: this.task.id })
    setTooltip(idEl, t('taskEditor.copyId'))
    idEl.addEventListener(
      'click',
      safeAsync(async () => {
        await navigator.clipboard.writeText(this.task.id)
        new Notice(t('taskEditor.copiedId'))
      })
    )

    header.createDiv('pm-te-header-spacer')

    if (!this.isNew) {
      const moreBtn = new ExtraButtonComponent(header)
        .setIcon('more-horizontal')
        .setTooltip(t('taskEditor.moreActions'))
      moreBtn.extraSettingsEl.addClass('pm-te-header-btn')
      moreBtn.onClick(() => this.openOverflowMenu(moreBtn.extraSettingsEl))
    }
    const closeBtn = new ExtraButtonComponent(header).setIcon('x').setTooltip(t('common.close'))
    closeBtn.extraSettingsEl.addClass('pm-te-header-btn')
    closeBtn.onClick(() => {
      this.cancelled = true
      this.host.close()
    })

    const body = contentEl.createDiv('pm-te-body')

    const titleWrap = body.createDiv('pm-te-title-wrap')
    const titleInput = titleWrap.createEl('textarea', { cls: 'pm-te-title' })
    this.titleInput = titleInput
    titleInput.rows = 1
    titleInput.value = this.task.title
    titleInput.placeholder = t('taskEditor.titlePlaceholder')
    titleInput.spellcheck = false
    const autosizeTitle = () => {
      titleInput.setCssProps({ '--te-title-height': 'auto' })
      titleInput.setCssProps({ '--te-title-height': titleInput.scrollHeight + 'px' })
    }
    const titleError = titleWrap.createDiv({ cls: 'pm-modal-title-error', attr: { hidden: '' } })
    const clearTitleError = () => {
      if (titleError.hasAttribute('hidden')) return
      titleError.setAttribute('hidden', '')
      titleError.setText('')
      titleInput.classList.remove('pm-input-error')
    }
    const showTitleError = (message: string) => {
      titleError.setText(message)
      titleError.removeAttribute('hidden')
      titleInput.classList.add('pm-input-error')
      titleInput.focus()
      titleInput.select()
    }
    titleInput.addEventListener('input', () => {
      this.task.title = titleInput.value
      clearTitleError()
      autosizeTitle()
    })
    titleInput.addEventListener('keydown', (e) => {
      // Safari can report a committing Enter as the legacy keyCode 229 instead of isComposing.
      const legacyKeyCode = (e as unknown as { keyCode?: number }).keyCode
      if (e.key !== 'Enter' || e.isComposing || legacyKeyCode === 229) return
      if (Keymap.isModifier(e, this.plugin.settings.editorSaveModifier)) return
      e.preventDefault()
      // Enter leaves the title for the first property, so the whole form can be filled by keyboard.
      const next = this.containerEl?.querySelector<HTMLElement>(
        '.pm-te-props button, .pm-te-props input, .pm-te-props select, .pm-te-props [tabindex]'
      )
      next?.focus()
    })
    window.setTimeout(autosizeTitle, 0)

    const props = body.createDiv('pm-te-props')
    renderTaskFormFields(props, {
      task: this.task,
      project: this.project,
      plugin: this.plugin,
      parentId: this.parentId,
      setParentId: (id) => {
        this.parentId = id
      },
      rerender: () => this.renderKeepingFocus(),
      shownExtras: this.shownExtras,
      openTask: (path) => this.openLinkedTask(path)
    })

    const descSection = body.createDiv('pm-modal-section pm-modal-desc-section')
    descSection.createEl('h4', { text: t('common.description'), cls: 'pm-modal-section-title' })

    const descPreview = descSection.createDiv('pm-modal-desc-preview')
    descPreview.tabIndex = 0
    descPreview.setAttribute('role', 'button')
    descPreview.setAttribute('aria-label', t('taskEditor.editDescription'))
    const descArea = descSection.createEl('textarea', { cls: 'pm-modal-description' })
    descArea.placeholder = t('taskEditor.descriptionPlaceholder')
    descArea.value = this.task.description

    const autoResize = () => {
      const saved: [HTMLElement, number][] = []
      let ancestor = descArea.parentElement
      while (ancestor) {
        if (ancestor.scrollTop > 0) saved.push([ancestor, ancestor.scrollTop])
        ancestor = ancestor.parentElement
      }
      descArea.setCssProps({ '--desc-height': 'auto' })
      const borders = descArea.offsetHeight - descArea.clientHeight
      descArea.setCssProps({ '--desc-height': descArea.scrollHeight + borders + 'px' })
      for (const [el, top] of saved) el.scrollTop = top
    }

    let measuredWidth = 0
    this.descResizeObserver?.disconnect()
    this.descResizeObserver = new ResizeObserver(() => {
      if (descArea.clientWidth === measuredWidth) return
      measuredWidth = descArea.clientWidth
      if (!descArea.classList.contains('pm-hidden')) autoResize()
    })
    this.descResizeObserver.observe(descArea)

    const hasContent = () => this.task.description.trim().length > 0
    const sourcePath = this.task.filePath || this.project.filePath || ''

    let descComp = new Component()
    descComp.load()

    const toggleCheckbox = (index: number) => {
      let count = 0
      this.task.description = this.task.description.replace(
        /^([ \t]*[-*+] \[)([ x])(\])/gm,
        (match, pre, state, post) => {
          if (count++ === index) return pre + (state === ' ' ? 'x' : ' ') + post
          return match
        }
      )
      descArea.value = this.task.description
      void renderPreview()
    }

    const attachCheckboxListeners = () => {
      descPreview.querySelectorAll('input[type="checkbox"]').forEach((el, i) => {
        const cb = el as HTMLInputElement
        cb.removeAttribute('disabled')
        cb.addEventListener('click', (e) => {
          e.preventDefault()
          toggleCheckbox(i)
        })
      })
    }

    // Electron silently drops file:// under the target="_blank" MarkdownRenderer emits.
    const attachFileLinkHandlers = () => {
      descPreview.querySelectorAll<HTMLAnchorElement>('a.external-link').forEach((a) => {
        if (!a.href.startsWith('file://')) return
        a.addEventListener('click', (e) => {
          e.preventDefault()
          activeWindow.open(a.href)
        })
      })
    }

    const renderPreview = async () => {
      descComp.unload()
      descComp = new Component()
      descComp.load()
      descPreview.empty()
      await MarkdownRenderer.render(this.app, this.task.description, descPreview, sourcePath, descComp)
      attachCheckboxListeners()
      attachFileLinkHandlers()
    }

    const showEdit = (caret?: number) => {
      descPreview.classList.add('pm-hidden')
      descArea.classList.remove('pm-hidden')
      descArea.value = this.task.description
      window.setTimeout(() => {
        autoResize()
        descArea.focus()
        if (caret !== undefined) descArea.setSelectionRange(caret, caret)
      }, 0)
    }

    const showPreview = () => {
      if (!hasContent() || !descArea.isConnected) return
      void renderPreview()
      descArea.classList.add('pm-hidden')
      descPreview.classList.remove('pm-hidden')
    }

    descPreview.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault()
      showEdit(0)
    })

    descArea.addEventListener('input', () => {
      this.task.description = descArea.value
      autoResize()
    })
    // Let the next Tab land before the textarea is swapped for the preview.
    descArea.addEventListener('blur', () => window.setTimeout(showPreview, 0))

    descArea.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items
      if (!items) return
      const attachments: { blob: Blob; name: string }[] = []
      for (const item of Array.from(items)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            const stamp = new Date().toISOString().replace(/[:.]/g, '-')
            const sub = (item.type.split('/')[1] || 'png').split('+')[0]
            const ext = sub === 'jpeg' ? 'jpg' : sub
            attachments.push({ blob: file, name: `Pasted-${stamp}.${ext}` })
          }
        }
      }
      if (attachments.length === 0) return
      e.preventDefault()
      void this.insertAttachments(descArea, attachments, autoResize)
    })

    descSection.addEventListener('dragover', (e) => {
      if (!e.dataTransfer) return
      if (!Array.from(e.dataTransfer.types).includes('Files')) return
      e.preventDefault()
    })

    descSection.addEventListener('drop', (e) => {
      const files = e.dataTransfer?.files
      if (!files || files.length === 0) return
      e.preventDefault()
      if (descArea.classList.contains('pm-hidden')) {
        showEdit()
        descArea.selectionStart = descArea.selectionEnd = descArea.value.length
      }
      const attachments = Array.from(files).map((f) => ({ blob: f, name: f.name }))
      void this.insertAttachments(descArea, attachments, autoResize)
    })

    this.noteSuggest?.destroy()
    this.noteSuggest = new NoteLinkSuggest(this.app, descArea, (newValue) => {
      this.task.description = newValue
      autoResize()
    })
    this.noteSuggest.attach(descSection)

    // Walk rendered text and markdown source in step, skipping source characters that
    // produced no output, so a caret in the preview lands past the syntax around it.
    const sourceOffsetOf = (renderedIndex: number) => {
      const rendered = descPreview.textContent || ''
      const src = this.task.description
      const plain = (c: string) => (/\s/.test(c) ? ' ' : c)
      let cursor = 0
      for (let i = 0; i < renderedIndex && i < rendered.length; i++) {
        const ch = plain(rendered[i])
        while (cursor < src.length && plain(src[cursor]) !== ch) cursor++
        cursor++
      }
      return Math.min(cursor, src.length)
    }

    const clickedSourceOffset = (e: MouseEvent) => {
      const doc = descPreview.ownerDocument
      const caret = doc.caretPositionFromPoint?.(e.clientX, e.clientY)
      const node = caret?.offsetNode
      if (!node || node.nodeType !== Node.TEXT_NODE || !descPreview.contains(node)) return undefined
      const walker = doc.createTreeWalker(descPreview, NodeFilter.SHOW_TEXT)
      let rendered = 0
      let current = walker.nextNode()
      while (current && current !== node) {
        rendered += (current.textContent || '').length
        current = walker.nextNode()
      }
      return current ? sourceOffsetOf(rendered + caret.offset) : undefined
    }

    descPreview.addEventListener('click', (e) => {
      const target = e.target as HTMLElement
      if (target.instanceOf(HTMLInputElement) && target.type === 'checkbox') return

      const link = target.closest('a')

      if (link) {
        if (link.classList.contains('internal-link')) {
          e.preventDefault()
          e.stopPropagation()
          void this.openNote(link.getAttribute('data-href') || link.getAttribute('href') || '', e)
          return
        }
        return
      }

      if (target.instanceOf(HTMLImageElement)) return

      const selection = activeWindow.getSelection()
      if (selection && !selection.isCollapsed && descPreview.contains(selection.anchorNode)) return

      showEdit(clickedSourceOffset(e))
    })

    if (hasContent()) {
      descArea.classList.add('pm-hidden')
      void renderPreview()
    } else {
      descPreview.classList.add('pm-hidden')
      window.setTimeout(autoResize, 0)
    }

    renderSubtasksPanel(body, this.task, this.plugin.store.configFor(this.project).statuses, (path) =>
      this.openLinkedTask(path)
    )

    renderTimeTrackingPanel(body, this.task)

    const footer = contentEl.createDiv('pm-te-footer')

    if (!this.isNew && this.task.filePath) {
      const filePath = this.task.filePath
      const pathHint = footer.createSpan({ cls: 'pm-te-footer-path pm-te-copyable' })
      const fileIcon = pathHint.createSpan({ cls: 'pm-te-footer-icon' })
      setIcon(fileIcon, 'file-text')
      pathHint.createSpan({ text: filePath })
      setTooltip(pathHint, t('taskEditor.copyPath'))
      pathHint.addEventListener(
        'click',
        safeAsync(async () => {
          await navigator.clipboard.writeText(filePath)
          new Notice(t('taskEditor.copiedPath'))
        })
      )
    }

    footer.createDiv('pm-footer-spacer')

    new ButtonComponent(footer).setButtonText(t('common.cancel')).onClick(() => {
      this.cancelled = true
      this.host.close()
    })

    const modifier = this.plugin.settings.editorSaveModifier
    const saveBtn = new ButtonComponent(footer)
      .setButtonText(t(this.isNew ? 'taskEditor.create' : 'taskEditor.save', { shortcut: saveShortcutLabel(modifier) }))
      .setCta()
    let saving = false
    const doSave = async () => {
      if (saving) return
      saving = true
      try {
        if (!this.task.title.trim()) {
          titleInput.focus()
          titleInput.classList.add('pm-input-error')
          return
        }
        clearTitleError()
        await this.persistTask()
        this.saved = true
        this.host.close()
      } catch (err) {
        if (err instanceof TaskFileNameConflictError) {
          showTitleError(t('taskEditor.titleConflict', { name: err.fileName }))
          return
        }
        console.error('[PM]', err)
        new Notice(t('common.somethingWentWrong'))
      } finally {
        saving = false
      }
    }

    saveBtn.onClick(() => {
      void doSave()
    })

    if (this.saveKeyHandler) this.host.scope.unregister(this.saveKeyHandler)
    this.saveKeyHandler = this.host.scope.register([modifier], 'Enter', () => {
      void doSave()
      return false
    })
  }
}
