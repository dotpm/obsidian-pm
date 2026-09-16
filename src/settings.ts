import { App, Notice, Platform, PluginSettingTab, Setting, debounce } from 'obsidian'
import type { SettingDefinitionItem, SettingDefinitionPage } from 'obsidian'
import type PMPlugin from './main'
import { type PMSettings, DEFAULT_SETTINGS, priorityIconSetLabels, makeId, flattenTasks, t, tn } from '@dotpm/core'
import { saveShortcutLabel } from './utils'
import { renderCustomFieldFields, renderCustomFieldOptions } from '@dotpm/ui'
import {
  countTaskNotesPaletteChanges,
  getTaskNotesApi,
  importTaskNotesPalettes,
  isTaskNotesInstalled
} from './integrations/tasknotes'
import { renderPaletteFields, renderStatusDoneToggle } from './ui/PaletteListEditor'
import { renderPersonPicker } from './ui/PersonPicker'
import { generateToken } from './api/LocalApiServer'

export type { PMSettings }
export { DEFAULT_SETTINGS }

export class PMSettingTab extends PluginSettingTab {
  plugin: PMPlugin
  /** A folder name is typed one character at a time; each sweep costs the whole vault. */
  private readonly rebuildIndex: () => void

  constructor(app: App, plugin: PMPlugin) {
    super(app, plugin)
    this.plugin = plugin
    this.icon = 'chart-gantt'
    this.rebuildIndex = debounce(() => this.plugin.index.build(), 500)
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        type: 'group',
        heading: t('settings.general.heading'),
        items: [
          {
            name: t('settings.projectsFolder.name'),
            desc: t('settings.projectsFolder.desc'),
            aliases: ['projects folder', 'location'],
            control: {
              type: 'folder',
              key: 'projectsFolder',
              defaultValue: 'Projects',
              placeholder: t('settings.projectsFolder.placeholder')
            }
          },
          this.excludedFoldersPage(),
          {
            name: t('settings.projectSurface.name'),
            desc: t('settings.projectSurface.desc'),
            aliases: ['click', 'project list', 'overview'],
            control: {
              type: 'dropdown',
              key: 'projectSurface',
              options: { overview: t('settings.projectSurface.overview'), tasks: t('settings.projectSurface.tasks') }
            }
          },
          {
            name: t('settings.defaultView.name'),
            desc: t('settings.defaultView.desc'),
            aliases: ['default view'],
            control: {
              type: 'dropdown',
              key: 'defaultView',
              options: { table: t('views.table'), gantt: t('views.gantt'), kanban: t('views.kanban') }
            }
          },
          {
            name: t('settings.taskEditorSurface.name'),
            desc: t('settings.taskEditorSurface.desc'),
            control: {
              type: 'dropdown',
              key: 'taskEditorSurface',
              options: { modal: t('settings.taskEditorSurface.modal'), tab: t('settings.taskEditorSurface.tab') }
            }
          },
          {
            name: t('settings.saveTaskOnClose.name'),
            desc: t('settings.saveTaskOnClose.desc'),
            control: { type: 'toggle', key: 'saveTaskOnClose' }
          },
          {
            name: t('settings.saveShortcut.name'),
            desc: t('settings.saveShortcut.desc'),
            aliases: ['hotkey', 'keyboard'],
            control: {
              type: 'dropdown',
              key: 'editorSaveModifier',
              options: { Shift: saveShortcutLabel('Shift'), Mod: saveShortcutLabel('Mod') }
            }
          },
          {
            name: t('settings.showReleaseNotes.name'),
            desc: t('settings.showReleaseNotes.desc'),
            aliases: ['changelog', "what's new", 'update'],
            control: { type: 'toggle', key: 'showReleaseNotes' }
          }
        ]
      },
      {
        type: 'group',
        heading: t('settings.style.heading'),
        items: [
          {
            name: t('settings.showTagColors.name'),
            desc: t('settings.showTagColors.desc'),
            aliases: ['appearance'],
            control: { type: 'toggle', key: 'showTagColors' }
          },
          {
            name: t('settings.priorityIcons.name'),
            desc: t('settings.priorityIcons.desc'),
            aliases: ['appearance', 'chevrons', 'signal'],
            control: {
              type: 'dropdown',
              key: 'priorityIcons',
              options: priorityIconSetLabels()
            }
          }
        ]
      },
      {
        type: 'group',
        heading: t('settings.table.heading'),
        items: [
          {
            name: t('settings.showSubtreeConnections.name'),
            desc: t('settings.showSubtreeConnections.desc'),
            aliases: ['tree', 'indent', 'subtask'],
            control: { type: 'toggle', key: 'showSubtreeConnections' }
          },
          {
            name: t('settings.lineBorders.name'),
            desc: t('settings.lineBorders.desc'),
            aliases: ['grid', 'lines'],
            control: {
              type: 'dropdown',
              key: 'lineBorders',
              options: {
                none: t('settings.lineBorders.none'),
                horizontal: t('settings.lineBorders.horizontal'),
                vertical: t('settings.lineBorders.vertical'),
                both: t('settings.lineBorders.both')
              }
            }
          }
        ]
      },
      {
        type: 'group',
        heading: t('settings.gantt.heading'),
        items: [
          {
            name: t('settings.ganttGranularity.name'),
            desc: t('settings.ganttGranularity.desc'),
            aliases: ['timeline', 'zoom'],
            control: {
              type: 'dropdown',
              key: 'ganttGranularity',
              options: {
                day: t('granularity.day'),
                week: t('granularity.week'),
                month: t('granularity.month'),
                quarter: t('granularity.quarter'),
                year: t('granularity.year')
              }
            }
          },
          {
            name: t('settings.ganttWeekLabel.name'),
            desc: t('settings.ganttWeekLabel.desc'),
            aliases: ['timeline'],
            control: {
              type: 'dropdown',
              key: 'ganttWeekLabel',
              options: {
                weekNumber: t('settings.ganttWeekLabel.weekNumber'),
                dateRange: t('settings.ganttWeekLabel.dateRange'),
                both: t('settings.ganttWeekLabel.both')
              }
            }
          }
        ]
      },
      {
        type: 'group',
        heading: t('settings.board.heading'),
        items: [
          {
            name: t('settings.kanbanShowSubtasks.name'),
            desc: t('settings.kanbanShowSubtasks.desc'),
            aliases: ['kanban'],
            control: { type: 'toggle', key: 'kanbanShowSubtasks' }
          },
          {
            name: t('settings.kanbanShowDescriptionPreview.name'),
            desc: t('settings.kanbanShowDescriptionPreview.desc'),
            aliases: ['kanban'],
            control: { type: 'toggle', key: 'kanbanShowDescriptionPreview' }
          }
        ]
      },
      {
        type: 'group',
        heading: t('settings.scheduling.heading'),
        items: [
          {
            name: t('settings.autoSchedule.name'),
            desc: t('settings.autoSchedule.desc'),
            aliases: ['dependencies'],
            control: { type: 'toggle', key: 'autoSchedule' }
          },
          {
            name: t('settings.pullForward.name'),
            desc: t('settings.pullForward.desc'),
            aliases: ['dependencies'],
            control: {
              type: 'toggle',
              key: 'pullForwardOnEarlyFinish',
              disabled: () => !this.plugin.settings.autoSchedule
            }
          }
        ]
      },
      {
        type: 'group',
        heading: t('settings.archive.heading'),
        items: [
          {
            name: t('settings.autoArchiveDays.name'),
            desc: t('settings.autoArchiveDays.desc'),
            aliases: ['archive', 'cleanup', 'done'],
            control: {
              type: 'slider',
              key: 'autoArchiveDays',
              min: 0,
              max: 90,
              step: 1
            }
          }
        ]
      },
      {
        type: 'group',
        heading: t('settings.notifications.heading'),
        items: [
          {
            name: t('settings.notificationsEnabled.name'),
            desc: t('settings.notificationsEnabled.desc'),
            aliases: ['notifications', 'banner'],
            control: { type: 'toggle', key: 'notificationsEnabled' }
          },
          {
            name: t('settings.notificationLeadDays.name'),
            desc: t('settings.notificationLeadDays.desc'),
            aliases: ['notifications', 'reminders', 'lead time'],
            control: {
              type: 'slider',
              key: 'notificationLeadDays',
              min: 1,
              max: 14,
              step: 1,
              disabled: () => !this.plugin.settings.notificationsEnabled
            }
          }
        ]
      },
      this.localApiGroup(),
      {
        type: 'group',
        heading: t('settings.taskFields.heading'),
        items: [this.statusesPage(), this.prioritiesPage(), this.customFieldsPage(), this.teamMembersPage()]
      },
      {
        type: 'group',
        heading: t('settings.integrations.heading'),
        visible: () => isTaskNotesInstalled(this.app),
        items: [this.taskNotesPage()]
      }
    ]
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    await super.setControlValue(key, value)
    // Today's pass ran against the old window, so it has to run again to reflect the new one.
    if (key === 'autoArchiveDays') {
      this.plugin.settings.lastAutoArchiveDate = ''
      await this.plugin.autoArchiver.check()
    }
    if (key.startsWith('localApi')) await this.plugin.syncLocalApi()
    this.plugin.refreshViews()
    this.refreshDomState()
  }

  private async regenerateLocalApiToken(): Promise<void> {
    this.plugin.settings.localApiToken = generateToken()
    await this.plugin.saveSettings()
    this.update()
  }

  private localApiGroup(): SettingDefinitionItem {
    const enabled = (): boolean => this.plugin.settings.localApiEnabled
    return {
      type: 'group',
      heading: t('settings.localApi.heading'),
      visible: () => Platform.isDesktopApp,
      items: [
        {
          name: t('settings.localApiEnabled.name'),
          desc: t('settings.localApiEnabled.desc', { port: String(this.plugin.settings.localApiPort) }),
          aliases: ['api', 'mcp', 'server', 'agent', 'local'],
          control: { type: 'toggle', key: 'localApiEnabled' }
        },
        {
          name: t('settings.localApiPort.name'),
          desc: t('settings.localApiPort.desc'),
          aliases: ['api', 'mcp'],
          control: {
            type: 'number',
            key: 'localApiPort',
            min: 1024,
            max: 65535,
            step: 1,
            validate: (value) =>
              Number.isInteger(value) && value >= 1024 && value <= 65535
                ? undefined
                : t('settings.localApiPort.invalid'),
            disabled: () => !enabled()
          }
        },
        {
          name: t('settings.localApiToken.name'),
          desc: t('settings.localApiToken.desc'),
          aliases: ['api', 'mcp', 'secret'],
          control: {
            type: 'text',
            key: 'localApiToken',
            validate: (value) => (value.trim().length >= 16 ? undefined : t('settings.localApiToken.invalid')),
            disabled: () => !enabled()
          }
        },
        {
          name: t('settings.regenerateToken.name'),
          desc: t('settings.regenerateToken.desc'),
          aliases: ['api', 'mcp', 'secret'],
          action: () => {
            void this.regenerateLocalApiToken()
          },
          disabled: () => !enabled()
        }
      ]
    }
  }

  private statusesPage(): SettingDefinitionPage {
    const statuses = this.plugin.settings.statuses
    return {
      type: 'page',
      name: t('settings.statuses.name'),
      desc: t('settings.statuses.desc'),
      displayValue: () => tn('settings.statusCount', this.plugin.settings.statuses.length),
      items: [
        {
          type: 'list',
          heading: t('settings.statuses.name'),
          emptyState: t('settings.statuses.empty'),
          items: statuses.map((status) => ({
            name: status.label,
            render: (setting: Setting) => {
              setting.setClass('pm-palette-row')
              renderPaletteFields(setting.controlEl, status, () => this.persist())
              renderStatusDoneToggle(setting.controlEl, status, () => this.persist())
            }
          })),
          onReorder: (from, to) => this.reorder(statuses, from, to),
          onDelete: (index) => this.deleteEntry('status', index),
          addItem: {
            name: t('settings.statuses.add'),
            action: () => {
              statuses.push({
                id: 'status-' + makeId().slice(0, 6),
                label: t('settings.statuses.newLabel'),
                color: '#8a94a0',
                icon: '',
                complete: false
              })
              this.persist()
              this.update()
            }
          }
        }
      ]
    }
  }

  private customFieldsPage(): SettingDefinitionPage {
    const fields = this.plugin.settings.customFields
    return {
      type: 'page',
      name: t('settings.customFields.name'),
      desc: t('settings.customFields.desc'),
      displayValue: () => tn('settings.fieldCount', this.plugin.settings.customFields.length),
      items: [
        {
          type: 'list',
          heading: t('settings.customFields.name'),
          emptyState: t('settings.customFields.empty'),
          items: fields.map((field) => ({
            name: field.name,
            render: (setting: Setting) => {
              setting.setClass('pm-palette-row')
              setting.setClass('pm-cf-settings-row')
              renderCustomFieldFields(
                setting.controlEl,
                field,
                () => this.persist(),
                () => this.update()
              )
              renderCustomFieldOptions(setting.controlEl, field, () => this.persist())
            }
          })),
          onReorder: (from, to) => this.reorder(fields, from, to),
          onDelete: (index) => {
            fields.splice(index, 1)
            this.persist()
            this.update()
          },
          addItem: {
            name: t('settings.customFields.add'),
            action: () => {
              fields.push({ id: makeId(), name: t('settings.customFields.newLabel'), type: 'text' })
              this.persist()
              this.update()
            }
          }
        }
      ]
    }
  }

  private prioritiesPage(): SettingDefinitionPage {
    const priorities = this.plugin.settings.priorities
    return {
      type: 'page',
      name: t('settings.priorities.name'),
      desc: t('settings.priorities.desc'),
      displayValue: () => tn('settings.priorityCount', this.plugin.settings.priorities.length),
      items: [
        {
          type: 'list',
          heading: t('settings.priorities.name'),
          emptyState: t('settings.priorities.empty'),
          items: priorities.map((priority) => ({
            name: priority.label,
            render: (setting: Setting) => {
              setting.setClass('pm-palette-row')
              renderPaletteFields(setting.controlEl, priority, () => this.persist())
            }
          })),
          onReorder: (from, to) => this.reorder(priorities, from, to),
          onDelete: (index) => this.deleteEntry('priority', index),
          addItem: {
            name: t('settings.priorities.add'),
            action: () => {
              priorities.push({
                id: 'priority-' + makeId().slice(0, 6),
                label: t('settings.priorities.newLabel'),
                color: '#8a94a0',
                icon: ''
              })
              this.persist()
              this.update()
            }
          }
        }
      ]
    }
  }

  private taskNotesPage(): SettingDefinitionPage {
    const connected = (): boolean => getTaskNotesApi(this.app) !== null
    return {
      type: 'page',
      name: t('settings.taskNotes.name'),
      desc: t('settings.taskNotes.desc'),
      displayValue: () => this.taskNotesStatus(),
      status: () => (connected() ? null : 'warning'),
      items: [
        {
          type: 'list',
          extraButtons: [
            (button) =>
              button
                .setIcon('refresh-cw')
                .setTooltip(t('settings.taskNotes.import'))
                .setDisabled(!connected())
                .onClick(() => this.importFromTaskNotes())
          ],
          items: [
            {
              name: t('settings.taskNotes.palettes.name'),
              desc: t('settings.taskNotes.palettes.desc'),
              render: (setting: Setting) => {
                setting.controlEl.createDiv({ cls: 'setting-item-value', text: this.taskNotesStatus() })
              }
            }
          ]
        }
      ]
    }
  }

  /** Whether an import would change anything right now. */
  private taskNotesStatus(): string {
    const api = getTaskNotesApi(this.app)
    if (!api) return t('settings.taskNotes.updateRequired')
    const { added, updated } = countTaskNotesPaletteChanges(api, this.plugin.settings)
    const total = added + updated
    return total === 0 ? t('settings.taskNotes.upToDate') : tn('settings.changeCount', total)
  }

  private excludedFoldersPage(): SettingDefinitionPage {
    const folders = this.plugin.settings.excludedFolders
    return {
      type: 'page',
      name: t('settings.excludedFolders.name'),
      desc: t('settings.excludedFolders.desc'),
      displayValue: () => tn('settings.folderCount', this.plugin.settings.excludedFolders.length),
      items: [
        {
          type: 'list',
          heading: t('settings.excludedFolders.name'),
          emptyState: t('settings.excludedFolders.empty'),
          items: folders.map((folder, index) => ({
            name: folder || t('settings.excludedFolders.unnamed'),
            render: (setting: Setting) => {
              setting.setClass('pm-palette-row')
              setting.addText((text) =>
                text
                  .setPlaceholder(t('settings.excludedFolders.placeholder'))
                  .setValue(folder)
                  .onChange((value) => {
                    this.plugin.settings.excludedFolders[index] = value
                    this.persist()
                    this.rebuildIndex()
                  })
              )
            }
          })),
          onDelete: (index) => {
            folders.splice(index, 1)
            this.persist()
            this.plugin.index.build()
            this.update()
          },
          addItem: {
            name: t('settings.excludedFolders.add'),
            action: () => {
              folders.push('')
              this.persist()
              this.update()
            }
          }
        }
      ]
    }
  }

  private teamMembersPage(): SettingDefinitionPage {
    const members = this.plugin.settings.globalTeamMembers
    return {
      type: 'page',
      name: t('settings.teamMembers.name'),
      desc: t('settings.teamMembers.desc'),
      displayValue: () => tn('settings.personCount', this.plugin.settings.globalTeamMembers.length),
      items: [
        {
          name: t('settings.peopleFolder.name'),
          desc: t('settings.peopleFolder.desc'),
          aliases: ['people', 'person notes'],
          control: {
            type: 'folder',
            key: 'peopleFolder',
            defaultValue: 'People',
            placeholder: t('settings.peopleFolder.placeholder')
          }
        },
        {
          name: t('settings.teamMembersList.name'),
          desc: t('settings.teamMembersList.desc'),
          render: (setting: Setting) => {
            renderPersonPicker({
              container: setting.controlEl,
              plugin: this.plugin,
              sourcePath: '',
              addLabel: t('people.addMember'),
              selected: () => this.plugin.settings.globalTeamMembers,
              add: (value) => {
                members.push(value)
                this.persist()
              },
              remove: (value) => {
                const index = members.indexOf(value)
                if (index >= 0) members.splice(index, 1)
                this.persist()
              }
            })
          }
        }
      ]
    }
  }

  private persist(): void {
    void this.plugin.saveSettings()
    this.plugin.refreshViews()
  }

  private reorder<T>(items: T[], from: number, to: number): void {
    const [moved] = items.splice(from, 1)
    items.splice(to, 0, moved)
    this.persist()
    this.update()
  }

  private deleteEntry(field: 'status' | 'priority', index: number): void {
    const entries = field === 'status' ? this.plugin.settings.statuses : this.plugin.settings.priorities
    if (entries.length <= 1) {
      new Notice(t(field === 'status' ? 'settings.atLeastOneStatus' : 'settings.atLeastOnePriority'))
      return
    }
    const [removed] = entries.splice(index, 1)
    this.persist()
    this.update()
    void this.remapOrphanTasks(field, removed.id, removed.label)
  }

  private importFromTaskNotes(): void {
    const api = getTaskNotesApi(this.app)
    if (!api) {
      new Notice(t('settings.taskNotes.required'))
      return
    }
    const { added, updated } = importTaskNotesPalettes(api, this.plugin.settings)
    this.persist()
    this.update()
    new Notice(
      added || updated ? t('settings.taskNotes.imported', { added, updated }) : t('settings.taskNotes.alreadyMatch')
    )
  }

  private async remapOrphanTasks(field: 'status' | 'priority', deletedId: string, deletedLabel: string): Promise<void> {
    const configs = field === 'status' ? this.plugin.settings.statuses : this.plugin.settings.priorities
    if (configs.length === 0) return
    const fallback = configs[0]
    // Only projects the index says still use the deleted value are worth loading.
    const affected = this.plugin.index
      .projectRefs(true)
      .filter((ref) => this.plugin.index.taskRefs(ref.path).some((task) => task[field] === deletedId))
      .map((ref) => ref.path)
    const projects = await this.plugin.store.loadProjects(affected)
    let remapped = 0
    for (const project of projects) {
      // A project defining this status or priority itself is unaffected by a global delete.
      const own = field === 'status' ? project.config?.statuses : project.config?.priorities
      if (own?.some((entry) => entry.id === deletedId)) continue
      const ids = flattenTasks(project.tasks)
        .filter(({ task }) => task[field] === deletedId)
        .map(({ task }) => task.id)
      if (ids.length) {
        await this.plugin.store.updateTasks(project, ids, { [field]: fallback.id })
        remapped += ids.length
      }
    }
    if (remapped > 0) {
      new Notice(tn('settings.remappedTasks', remapped, { from: deletedLabel, to: fallback.label }))
    }
  }
}
