import { App, Notice, Platform, PluginSettingTab, Setting, debounce } from 'obsidian'
import type { SettingDefinitionItem, SettingDefinitionPage } from 'obsidian'
import type PMPlugin from './main'
import {
  type PMSettings,
  DEFAULT_SETTINGS,
  PRIORITY_ICON_SET_LABELS,
  makeId,
  flattenTasks,
  t,
  tn,
  setLocale
} from '@dotpm/core'
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

function priorityIconSetOptions(): Record<string, string> {
  return Object.fromEntries(Object.entries(PRIORITY_ICON_SET_LABELS).map(([id, label]) => [id, t(label)]))
}

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
        heading: t('General'),
        items: [
          {
            name: t('Language'),
            desc: t('UI language for the plugin. Command palette names catch up the next time Obsidian starts.'),
            aliases: ['language', 'i18n', 'chinese', '中文', '语言'],
            control: {
              type: 'dropdown',
              key: 'language',
              options: { en: 'English', zh: '简体中文' }
            }
          },
          {
            name: t('New project folder'),
            desc: t('Leave it empty to create them in the vault root.'),
            aliases: [t('projects folder'), t('location')],
            control: {
              type: 'folder',
              key: 'projectsFolder',
              defaultValue: 'Projects',
              placeholder: t('Vault root')
            }
          },
          this.excludedFoldersPage(),
          {
            name: t('Open projects in'),
            desc: t('Tasks skips the overview page and goes straight to the table, timeline, or board.'),
            aliases: [t('click'), t('project list'), t('overview')],
            control: {
              type: 'dropdown',
              key: 'projectSurface',
              options: { overview: t('Overview'), tasks: t('Tasks') }
            }
          },
          {
            name: t('Default tasks view'),
            desc: t("View a project's tasks open in."),
            aliases: [t('default view')],
            control: {
              type: 'dropdown',
              key: 'defaultView',
              options: { table: t('Table'), gantt: t('Gantt'), kanban: t('Board') }
            }
          },
          {
            name: t('Open tasks in'),
            desc: t("Tab also opens task notes in the task editor instead of Obsidian's."),
            control: {
              type: 'dropdown',
              key: 'taskEditorSurface',
              options: { modal: t('Modal'), tab: t('Tab') }
            }
          },
          {
            name: t('Save tasks on close'),
            desc: t('Save changes when the task editor is closed.'),
            control: { type: 'toggle', key: 'saveTaskOnClose' }
          },
          {
            name: t('Save shortcut'),
            desc: t('Key shortcut to create or save tasks and projects.'),
            aliases: [t('hotkey'), t('keyboard')],
            control: {
              type: 'dropdown',
              key: 'editorSaveModifier',
              options: { Shift: saveShortcutLabel('Shift'), Mod: saveShortcutLabel('Mod') }
            }
          }
        ]
      },
      {
        type: 'group',
        heading: t('Style'),
        items: [
          {
            name: t('Show tag colors'),
            desc: t('Give each tag a colored dot derived from its name.'),
            aliases: [t('appearance')],
            control: { type: 'toggle', key: 'showTagColors' }
          },
          {
            name: t('Priority icons'),
            desc: t('Icon set for priorities that have no icon of their own.'),
            aliases: [t('appearance'), t('chevrons'), t('signal')],
            control: {
              type: 'dropdown',
              key: 'priorityIcons',
              options: priorityIconSetOptions()
            }
          }
        ]
      },
      {
        type: 'group',
        heading: t('Table'),
        items: [
          {
            name: t('Show subtree connections'),
            desc: t('Draw lines tying a subtask row back to its parent.'),
            aliases: [t('tree'), t('indent'), t('subtask')],
            control: { type: 'toggle', key: 'showSubtreeConnections' }
          },
          {
            name: t('Line borders'),
            desc: t('Rules drawn between rows, between columns, or both.'),
            aliases: [t('grid'), t('lines')],
            control: {
              type: 'dropdown',
              key: 'lineBorders',
              options: { none: t('None'), horizontal: t('Horizontal'), vertical: t('Vertical'), both: t('Both') }
            }
          }
        ]
      },
      {
        type: 'group',
        heading: t('Gantt'),
        items: [
          {
            name: t('Default granularity'),
            desc: t('Time unit for each column in the timeline.'),
            aliases: [t('timeline'), t('zoom')],
            control: {
              type: 'dropdown',
              key: 'ganttGranularity',
              options: { day: t('Day'), week: t('Week'), month: t('Month'), quarter: t('Quarter'), year: t('Year') }
            }
          },
          {
            name: t('Week label'),
            desc: t('Text shown in weekly header cells.'),
            aliases: [t('timeline')],
            control: {
              type: 'dropdown',
              key: 'ganttWeekLabel',
              options: {
                weekNumber: t('Week number (w15)'),
                dateRange: t('Date range (apr 7\u201313)'),
                both: t('Both (w15: apr 7\u201313)')
              }
            }
          }
        ]
      },
      {
        type: 'group',
        heading: t('Board'),
        items: [
          {
            name: t('Show subtasks'),
            desc: t('Display subtasks as individual cards.'),
            aliases: [t('kanban')],
            control: { type: 'toggle', key: 'kanbanShowSubtasks' }
          },
          {
            name: t('Show description preview'),
            desc: t('Display the first few lines of each task description.'),
            aliases: [t('kanban')],
            control: { type: 'toggle', key: 'kanbanShowDescriptionPreview' }
          }
        ]
      },
      {
        type: 'group',
        heading: t('Scheduling'),
        items: [
          {
            name: t('Auto-schedule'),
            desc: t('Adjust dependent task dates when a task changes.'),
            aliases: [t('dependencies')],
            control: { type: 'toggle', key: 'autoSchedule' }
          },
          {
            name: t('Pull dependents forward'),
            desc: t('Move dependent tasks earlier when a task is completed before its due date.'),
            aliases: [t('dependencies')],
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
        heading: t('Archive'),
        items: [
          {
            name: t('Auto-archive completed tasks'),
            desc: t(
              "Move completed tasks to the project's archive after this many days. Set it to 0 to keep them in place."
            ),
            aliases: [t('archive'), t('cleanup'), t('done')],
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
        heading: t('Notifications'),
        items: [
          {
            name: t('Due date reminders'),
            desc: t('Show a banner when a task is approaching its due date.'),
            aliases: [t('notifications'), t('banner')],
            control: { type: 'toggle', key: 'notificationsEnabled' }
          },
          {
            name: t('Days in advance'),
            desc: t('How many days before the due date to notify.'),
            aliases: [t('notifications'), t('reminders'), t('lead time')],
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
        heading: t('Task fields'),
        items: [this.statusesPage(), this.prioritiesPage(), this.customFieldsPage(), this.teamMembersPage()]
      },
      {
        type: 'group',
        heading: t('Integrations'),
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
    if (key === 'language') {
      setLocale(this.plugin.settings.language)
      this.update()
      this.plugin.relocalize()
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
      heading: t('Local API'),
      visible: () => Platform.isDesktopApp,
      items: [
        {
          name: t('Serve projects to other apps'),
          desc: t(
            'Lets tools on this computer read and edit tasks over HTTP and MCP at http://127.0.0.1:{port}. Only this computer can connect, and every request needs the token. The MCP endpoint is /mcp.',
            { port: this.plugin.settings.localApiPort }
          ),
          aliases: [t('api'), t('mcp'), t('server'), t('agent'), t('local')],
          control: { type: 'toggle', key: 'localApiEnabled' }
        },
        {
          name: t('Port'),
          desc: t('Starts out derived from the vault name, so two open vaults do not want the same one.'),
          aliases: [t('api'), t('mcp')],
          control: {
            type: 'number',
            key: 'localApiPort',
            min: 1024,
            max: 65535,
            step: 1,
            validate: (value) =>
              Number.isInteger(value) && value >= 1024 && value <= 65535
                ? undefined
                : t('Use a port from 1024 to 65535.'),
            disabled: () => !enabled()
          }
        },
        {
          name: t('Token'),
          desc: t('Clients send it as a bearer token.'),
          aliases: [t('api'), t('mcp'), t('secret')],
          control: {
            type: 'text',
            key: 'localApiToken',
            validate: (value) => (value.trim().length >= 16 ? undefined : t('Use at least 16 characters.')),
            disabled: () => !enabled()
          }
        },
        {
          name: t('Regenerate token'),
          desc: t('Every connected client will need the new one.'),
          aliases: [t('api'), t('mcp'), t('secret')],
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
      name: t('Statuses'),
      desc: t('Labels, colors, and icons for the status field.'),
      displayValue: () => tn(this.plugin.settings.statuses.length, '{n} status', '{n} statuses'),
      items: [
        {
          type: 'list',
          heading: t('Statuses'),
          emptyState: t('No statuses.'),
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
            name: t('Add status'),
            action: () => {
              statuses.push({
                id: 'status-' + makeId().slice(0, 6),
                label: t('New status'),
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
      name: t('Custom fields'),
      desc: t('Extra task properties available across all projects.'),
      displayValue: () => tn(this.plugin.settings.customFields.length, '{n} field', '{n} fields'),
      items: [
        {
          type: 'list',
          heading: t('Custom fields'),
          emptyState: t('No custom fields.'),
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
            name: t('Add custom field'),
            action: () => {
              fields.push({ id: makeId(), name: t('New field'), type: 'text' })
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
      name: t('Priorities'),
      desc: t('Labels, colors, and icons for the priority field.'),
      displayValue: () => tn(this.plugin.settings.priorities.length, '{n} priority', '{n} priorities'),
      items: [
        {
          type: 'list',
          heading: t('Priorities'),
          emptyState: t('No priorities.'),
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
            name: t('Add priority'),
            action: () => {
              priorities.push({
                id: 'priority-' + makeId().slice(0, 6),
                label: t('New priority'),
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
      name: 'TaskNotes',
      desc: t('Share statuses and priorities with the TaskNotes plugin.'),
      displayValue: () => this.taskNotesStatus(),
      status: () => (connected() ? null : 'warning'),
      items: [
        {
          type: 'list',
          extraButtons: [
            (button) =>
              button
                .setIcon('refresh-cw')
                .setTooltip(t('Import from TaskNotes'))
                .setDisabled(!connected())
                .onClick(() => this.importFromTaskNotes())
          ],
          items: [
            {
              name: t('Statuses and priorities'),
              desc: t('Copies labels, colors, and completion from TaskNotes 4.10 or newer.'),
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
    if (!api) return t('Update required')
    const { added, updated } = countTaskNotesPaletteChanges(api, this.plugin.settings)
    const total = added + updated
    return total === 0 ? t('Up to date') : tn(total, '{n} change', '{n} changes')
  }

  private excludedFoldersPage(): SettingDefinitionPage {
    const folders = this.plugin.settings.excludedFolders
    return {
      type: 'page',
      name: t('Excluded folders'),
      desc: t('Folders to skip when looking for projects and tasks, such as templates.'),
      displayValue: () => tn(this.plugin.settings.excludedFolders.length, '{n} folder', '{n} folders'),
      items: [
        {
          type: 'list',
          heading: t('Excluded folders'),
          emptyState: t('No folders excluded.'),
          items: folders.map((folder, index) => ({
            name: folder || t('Unnamed folder'),
            render: (setting: Setting) => {
              setting.setClass('pm-palette-row')
              setting.addText((text) =>
                text
                  .setPlaceholder(t('Templates'))
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
            name: t('Add folder'),
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
      name: t('Team members'),
      desc: t('People available as assignees across all projects.'),
      displayValue: () => tn(this.plugin.settings.globalTeamMembers.length, '{n} person', '{n} people'),
      items: [
        {
          name: t('People folder'),
          desc: t('Where person notes are looked for and created. Leave it empty to search the whole vault.'),
          aliases: [t('people'), t('person notes')],
          control: {
            type: 'folder',
            key: 'peopleFolder',
            defaultValue: 'People',
            placeholder: t('Whole vault')
          }
        },
        {
          name: t('Team members'),
          desc: t('Offered as assignees and members in every project.'),
          render: (setting: Setting) => {
            renderPersonPicker({
              container: setting.controlEl,
              plugin: this.plugin,
              sourcePath: '',
              addLabel: t('Add member'),
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
      new Notice(t('You must have at least one {field}.', { field: field === 'status' ? t('status') : t('priority') }))
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
      new Notice(t('TaskNotes 4.10 or newer is required.'))
      return
    }
    const { added, updated } = importTaskNotesPalettes(api, this.plugin.settings)
    this.persist()
    this.update()
    new Notice(
      added || updated
        ? t('Imported from TaskNotes: {added} added, {updated} updated.', { added, updated })
        : t('Statuses and priorities already match TaskNotes.')
    )
  }

  private async remapOrphanTasks(field: 'status' | 'priority', deletedId: string, deletedLabel: string): Promise<void> {
    const configs = field === 'status' ? this.plugin.settings.statuses : this.plugin.settings.priorities
    if (configs.length === 0) return
    const fallback = configs[0]
    // Only projects the index says still use the deleted value are worth loading.
    const affected = this.plugin.index
      .projectRefs()
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
      new Notice(
        t("Remapped {n} task(s) from '{from}' to '{to}'.", { n: remapped, from: deletedLabel, to: fallback.label })
      )
    }
  }
}
