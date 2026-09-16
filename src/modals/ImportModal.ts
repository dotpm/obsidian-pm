import { App, ButtonComponent, Modal, TFile, Notice } from 'obsidian'
import type PMPlugin from '#main'
import {
  type PriorityConfig,
  type Project,
  type StatusConfig,
  type TaskStatus,
  type TaskPriority,
  getDefaultStatusId,
  getDefaultPriorityId,
  t,
  tn
} from '@dotpm/core'
import {
  ensurePaletteEntries,
  getTaskNotesApi,
  resolveTaskNotesRef,
  type TaskNotesApi,
  type TaskNotesTaskInfo
} from '../integrations/tasknotes'
import { buildImportForest, type TaskNotesImportItem } from '../integrations/tasknotesImport'

interface FileItem {
  file: TFile
  folder: string
  selected: boolean
}

export class ImportModal extends Modal {
  private files: FileItem[] = []
  private filteredFiles: FileItem[] = []
  private selectedCount = 0
  private searchInput: HTMLInputElement | null = null
  private selectAllCheckbox: HTMLInputElement | null = null
  private nextButton: ButtonComponent | null = null
  private fileListContainer: HTMLDivElement | null = null
  private counterLabel: HTMLDivElement | null = null

  private phase: 1 | 2 = 1
  private defaultStatus: TaskStatus
  private defaultPriority: TaskPriority
  private fileHandling: 'move' | 'copy' = 'move'
  private project: Project | null = null
  private onImportComplete: (() => void) | null = null

  constructor(
    app: App,
    private plugin: PMPlugin
  ) {
    super(app)
    this.defaultStatus = getDefaultStatusId(plugin.settings.statuses)
    this.defaultPriority = getDefaultPriorityId(plugin.settings.priorities)
  }

  /** The target project's palettes, or the global ones until setProject has run. */
  private get palettes(): { statuses: StatusConfig[]; priorities: PriorityConfig[] } {
    return this.project ? this.plugin.store.configFor(this.project) : this.plugin.settings
  }

  onOpen(): void {
    const palettes = this.palettes
    this.defaultStatus = getDefaultStatusId(palettes.statuses)
    this.defaultPriority = getDefaultPriorityId(palettes.priorities)

    const { contentEl } = this
    contentEl.empty()
    contentEl.addClass('import-modal')
    this.modalEl.addClass('import-modal-container')

    this.loadVaultFiles()

    this.render()
  }

  onClose(): void {
    this.contentEl.empty()
  }

  private loadVaultFiles(): void {
    const allFiles = this.app.vault.getFiles()
    const markdownFiles = allFiles.filter((f) => f.extension === 'md')

    this.files = markdownFiles.map((file) => {
      const folder = file.parent?.path || '/'
      return {
        file,
        folder: folder === '/' ? '/' : folder,
        selected: false
      }
    })

    this.filteredFiles = [...this.files]
  }

  private render(): void {
    if (this.phase === 1) {
      this.renderPhase1()
    } else {
      this.renderPhase2()
    }
  }

  private renderPhase1(): void {
    const { contentEl } = this
    contentEl.empty()

    const header = contentEl.createDiv('import-modal-header')

    header.createEl('h2', { text: t('import.selectNotes') })

    this.counterLabel = header.createDiv('import-counter')
    this.updateCounter()

    const searchContainer = contentEl.createDiv('import-search-container')

    this.searchInput = searchContainer.createEl('input', {
      type: 'text',
      cls: 'prompt-input import-search-input',
      placeholder: t('import.searchFiles')
    })
    this.searchInput.addEventListener('input', () => this.handleSearch())

    const listContainer = contentEl.createDiv('import-list-wrapper')

    this.fileListContainer = listContainer

    const selectAllRow = listContainer.createDiv('import-select-all-row')

    this.selectAllCheckbox = selectAllRow.createEl('input', {
      type: 'checkbox'
    })
    this.selectAllCheckbox.addEventListener('change', () => this.handleSelectAll())

    const selectAllLabel = selectAllRow.createEl('label', { text: t('import.selectAll') })
    selectAllLabel.addEventListener('click', () => {
      if (this.selectAllCheckbox) {
        this.selectAllCheckbox.checked = !this.selectAllCheckbox.checked
        this.handleSelectAll()
      }
    })

    this.renderFileList()

    const footer = contentEl.createDiv('import-modal-footer')

    new ButtonComponent(footer).setButtonText(t('common.cancel')).onClick(() => this.close())

    this.nextButton = new ButtonComponent(footer)
      .setButtonText(t('import.next'))
      .setCta()
      .setDisabled(this.selectedCount === 0)
      .onClick(() => this.handleNext())
  }

  private renderPhase2(): void {
    const { contentEl } = this
    contentEl.empty()

    const header = contentEl.createDiv('import-options-header')
    header.createEl('h2', { text: t('import.options') })

    const content = contentEl.createDiv('import-options-content')

    const statusGroup = content.createDiv('import-option-group')
    statusGroup.createEl('label', { text: t('import.defaultStatus') })

    const statusSelect = statusGroup.createEl('select')

    this.palettes.statuses.forEach((s) => {
      const option = statusSelect.createEl('option', { text: s.label })
      option.value = s.id
      if (s.id === this.defaultStatus) option.selected = true
    })

    statusSelect.addEventListener('change', (e) => {
      this.defaultStatus = (e.target as HTMLSelectElement).value
    })

    const priorityGroup = content.createDiv('import-option-group')
    priorityGroup.createEl('label', { text: t('import.defaultPriority') })

    const prioritySelect = priorityGroup.createEl('select')

    this.palettes.priorities.forEach((p) => {
      const option = prioritySelect.createEl('option', { text: p.label })
      option.value = p.id
      if (p.id === this.defaultPriority) option.selected = true
    })

    prioritySelect.addEventListener('change', (e) => {
      this.defaultPriority = (e.target as HTMLSelectElement).value
    })

    const handlingGroup = content.createDiv('import-option-group')
    handlingGroup.createEl('label', { text: t('import.fileHandling') })

    const radioGroup = handlingGroup.createDiv('import-radio-group')

    const moveLabel = radioGroup.createEl('label')

    const moveRadio = moveLabel.createEl('input', { type: 'radio' })
    moveRadio.name = 'file-handling'
    moveRadio.value = 'move'
    moveRadio.checked = this.fileHandling === 'move'
    moveRadio.addEventListener('change', () => {
      this.fileHandling = 'move'
    })

    moveLabel.createSpan({ text: t('import.move') })

    const copyLabel = radioGroup.createEl('label')

    const copyRadio = copyLabel.createEl('input', { type: 'radio' })
    copyRadio.name = 'file-handling'
    copyRadio.value = 'copy'
    copyRadio.checked = this.fileHandling === 'copy'
    copyRadio.addEventListener('change', () => {
      this.fileHandling = 'copy'
    })

    copyLabel.createSpan({ text: t('import.copy') })

    const footer = contentEl.createDiv('import-modal-footer')

    new ButtonComponent(footer).setButtonText(t('import.back')).onClick(() => this.handleBack())

    const importButton = new ButtonComponent(footer)
      .setButtonText(t('import.submit', { count: this.selectedCount }))
      .setCta()
    importButton.onClick(() => {
      void this.handleImport()
    })
  }

  private applyRowStyles(row: HTMLDivElement, isSelected: boolean): void {
    row.toggleClass('import-file-item--selected', isSelected)
  }

  private renderFileList(): void {
    const fileListContainer = this.fileListContainer
    if (!fileListContainer) return

    const items = fileListContainer.querySelectorAll('.import-file-item')
    items.forEach((item) => item.remove())

    this.filteredFiles.forEach((item) => {
      const row = fileListContainer.createDiv('import-file-item suggestion-item')
      this.applyRowStyles(row, item.selected)

      const checkbox = row.createEl('input', { type: 'checkbox' })
      checkbox.checked = item.selected
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation()
        item.selected = checkbox.checked
        this.updateCounter()
        this.updateSelectAllCheckbox()
        this.updateNextButton()
        this.applyRowStyles(row, item.selected)
      })

      row.createSpan({ text: item.file.basename, cls: 'import-file-name' })
      row.createSpan({ text: item.folder, cls: 'import-file-folder' })

      row.addEventListener('click', (e) => {
        if (e.target === checkbox) return

        checkbox.checked = !checkbox.checked
        checkbox.dispatchEvent(new Event('change', { bubbles: true }))
      })
    })
  }

  private handleSearch(): void {
    const query = this.searchInput?.value.toLowerCase() || ''
    this.filteredFiles = this.files.filter(
      (item) => item.file.basename.toLowerCase().includes(query) || item.folder.toLowerCase().includes(query)
    )
    this.renderFileList()
  }

  private handleSelectAll(): void {
    const isChecked = this.selectAllCheckbox?.checked || false
    this.filteredFiles.forEach((item) => {
      item.selected = isChecked
    })
    this.updateCounter()
    this.updateNextButton()
    this.renderFileList()
  }

  private updateCounter(): void {
    if (!this.counterLabel) return
    const count = this.files.filter((f) => f.selected).length
    this.selectedCount = count
    this.counterLabel.setText(t('common.selectedCount', { count }))
  }

  private updateSelectAllCheckbox(): void {
    if (!this.selectAllCheckbox) return
    const allFiltered = this.filteredFiles.length > 0
    const allSelected = allFiltered && this.filteredFiles.every((f) => f.selected)
    this.selectAllCheckbox.checked = allSelected
  }

  private updateNextButton(): void {
    this.nextButton?.setDisabled(this.selectedCount === 0)
  }

  private handleNext(): void {
    if (this.selectedCount === 0) return
    this.phase = 2
    this.render()
  }

  private handleBack(): void {
    this.phase = 1
    this.render()
  }

  private async handleImport(): Promise<void> {
    if (!this.project) {
      new Notice(t('import.noProject'), 5000)
      return
    }

    const selectedFiles = this.files.filter((f) => f.selected).map((f) => f.file)
    let skipped = 0
    let imported = 0

    const api = getTaskNotesApi(this.app)
    const taskNotesApi = api?.hasCapability('tasks.read') ? api : null
    const taskNotesTasks: Array<{ file: TFile; info: TaskNotesTaskInfo }> = []

    for (const file of selectedFiles) {
      const alreadyPmTask = this.app.metadataCache.getFileCache(file)?.frontmatter?.['pm-task'] === true
      if (taskNotesApi && !alreadyPmTask) {
        const info = await taskNotesApi.getTask(file.path).catch(() => null)
        if (info) {
          taskNotesTasks.push({ file, info })
          continue
        }
      }
      try {
        const result = await this.plugin.store.importNoteAsTask(this.project, file, {
          status: this.defaultStatus,
          priority: this.defaultPriority,
          handling: this.fileHandling
        })
        if (result === 'imported') imported++
        else skipped++
      } catch (err) {
        console.error(`Failed to import ${file.basename}:`, err)
        skipped++
      }
    }

    if (taskNotesApi && taskNotesTasks.length) {
      try {
        imported += await this.importTaskNotesTasks(taskNotesApi, this.project, taskNotesTasks)
      } catch (err) {
        console.error('Failed to import TaskNotes tasks:', err)
        skipped += taskNotesTasks.length
      }
    }

    if (this.onImportComplete) {
      this.onImportComplete()
    }

    const message =
      skipped > 0 ? tn('import.importedWithSkipped', imported, { skipped }) : tn('import.imported', imported)
    new Notice(message, 3000)

    this.close()
  }

  /** Preserves dates, blockedBy edges, project-link hierarchy, tags, estimate, and archive state. */
  private async importTaskNotesTasks(
    api: TaskNotesApi,
    project: Project,
    tasks: Array<{ file: TFile; info: TaskNotesTaskInfo }>
  ): Promise<number> {
    const snapshot = api.hasCapability('settings.snapshot') ? api.getSettingsSnapshot() : {}
    const taskTag = snapshot.taskTag || 'task'
    const archiveTag = snapshot.fieldMapping?.archiveTag || 'archived'

    const resolve = (refs: string[] | undefined, sourcePath: string): string[] =>
      (refs ?? []).map((ref) => resolveTaskNotesRef(this.app, ref, sourcePath)).filter((p): p is string => p !== null)

    const items: TaskNotesImportItem[] = tasks.map(({ file, info }) => ({
      path: file.path,
      info,
      parentPaths: resolve(info.projects, file.path),
      blockedByPaths: resolve(
        (info.blockedBy ?? []).map((dep) => (typeof dep === 'string' ? dep : dep.uid)),
        file.path
      )
    }))

    const { roots, byPath } = buildImportForest(items, {
      defaultStatus: this.defaultStatus,
      defaultPriority: this.defaultPriority,
      taskTag,
      archiveTag
    })

    const usedStatuses = new Set(items.map((i) => i.info.status).filter(Boolean))
    const usedPriorities = new Set(items.map((i) => i.info.priority).filter(Boolean))
    if (ensurePaletteEntries(api, this.plugin.settings, usedStatuses, usedPriorities) > 0) {
      await this.plugin.saveSettings()
    }

    const sources = new Map<string, TFile>()
    for (const { file } of tasks) {
      const task = byPath.get(file.path)
      if (task) sources.set(task.id, file)
    }
    return this.plugin.store.importTaskForest(project, roots, sources, this.fileHandling)
  }

  setProject(project: Project): void {
    this.project = project
  }

  setOnImportComplete(handler: () => void): void {
    this.onImportComplete = handler
  }
}
