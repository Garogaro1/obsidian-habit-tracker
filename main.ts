import { App, Plugin, PluginSettingTab, Setting, TFile, TFolder, moment } from 'obsidian';
import { HabitTrackerView, VIEW_TYPE_HABIT_TRACKER } from './src/view';
import './styles.css';

interface HabitTrackerSettings {
	// Список папок для отслеживания (каждая с новой строки)
	watchedFolders: string;
	// Список форматов дат (каждый с новой строки)
	dateFormats: string;
	// Использовать Templater для новых заметок
	useTemplater: boolean;
	// Путь к папке с шаблонами Templater
	templatesFolder: string;
	// Шаблон Templater для дневных заметок
	dailyTemplate: string;
	// Шаблон Templater для недельных заметок
	weeklyTemplate: string;
	// Шаблон Templater для месячных заметок
	monthlyTemplate: string;
}

const DEFAULT_SETTINGS: HabitTrackerSettings = {
	// Ваши папки по умолчанию
	watchedFolders: 'Daily Notes\n2. Areas/diary',

	// Форматы:
	// 1. DD.MM.YY (Ваш основной: 30.12.24)
	// 2. Стандартные (YYYY-MM-DD, DD.MM.YYYY)
	// 3. Периодические заметки (Недели, Месяцы, Кварталы, Годы)
	dateFormats: 'DD.MM.YY\nDD.MM.YYYY\nYYYY-MM-DD\ngggg-[W]ww\nYYYY-MM\nYYYY-[Q]Q\nYYYY',

	// Templater
	useTemplater: false,
	templatesFolder: '5. Utils/Templates',
	dailyTemplate: '',
	weeklyTemplate: '',
	monthlyTemplate: '',
}

export default class HabitTrackerPlugin extends Plugin {
	settings: HabitTrackerSettings;
	templater: unknown; // Templater API

	async onload() {
		console.debug('Загрузка плагина Life Calendar');

		// Загрузка настроек
		await this.loadSettings();

		// Проверка Templater
		// @ts-ignore
		this.templater = this.app.plugins.plugins['templater-obsidian'];

		// Регистрация View
		this.registerView(
			VIEW_TYPE_HABIT_TRACKER,
			(leaf) => new HabitTrackerView(leaf, this)
		);

		// Команда для открытия view
		this.addCommand({
			id: 'open-habit-tracker',
			name: 'Открыть трекер привычек',
			callback: () => {
				this.activateView();
			},
		});

		// Иконка в ribbon
		this.addRibbonIcon('calendar-days', 'Трекер привычек', () => {
			this.activateView();
		});

		// Добавление настроек
		this.addSettingTab(new HabitTrackerSettingTab(this.app, this));
	}

	onunload() {
		console.debug('Выгрузка плагина Life Calendar');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(VIEW_TYPE_HABIT_TRACKER)[0];

		if (!leaf) {
			leaf = workspace.getLeaf(true);
		}

		await leaf.setViewState({
			type: VIEW_TYPE_HABIT_TRACKER,
			active: true,
		});

		workspace.revealLeaf(leaf);
	}

	/**
	 * Получить все заметки, соответствующие настроенным папкам и форматам
	 */
	getDailyNotes(): TFile[] {
		const folders = this.settings.watchedFolders
			.split('\n')
			.map(f => f.trim())
			.filter(f => f.length > 0);

		const formats = this.settings.dateFormats
			.split('\n')
			.map(f => f.trim())
			.filter(f => f.length > 0);

		const allFiles = this.app.vault.getMarkdownFiles();

		return allFiles.filter((file) => {
			// 1. Проверка папки
			const isInWatchedFolder = folders.some(folder => file.path.startsWith(folder));
			if (!isInWatchedFolder) return false;

			// 2. Проверка формата даты
			const nameWithoutExt = file.name.replace(/\.md$/, '');

			// Перебираем все форматы. strict = true важно для точности
			const isValidDate = formats.some(format =>
				moment(nameWithoutExt, format, true).isValid()
			);

			return isValidDate;
		});
	}
}

class HabitTrackerSettingTab extends PluginSettingTab {
	plugin: HabitTrackerPlugin;
	private focusHandler: (() => void) | null = null;

	constructor(app: App, plugin: HabitTrackerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Remove old datalist if exists (fixes overlay bug when switching tabs)
		const oldDatalist = document.getElementById('folder-suggestions');
		if (oldDatalist) oldDatalist.remove();

		containerEl.createEl('h3', { text: 'Источники данных' });

		// ===== TEMPLATER INTEGRATION =====
		const hasTemplater = this.plugin.templater !== undefined;

		containerEl.createEl('h3', { text: '🎨 Templater Интеграция' });

		new Setting(containerEl)
			.setName('Использовать Templater')
			.setDesc(hasTemplater
				? 'Применять шаблоны Templater при создании новых заметок'
				: '⚠️ Templater не установлен! Установите его для использования этой функции.')
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.useTemplater)
					.setDisabled(!hasTemplater)
					.onChange(async (value: boolean) => {
						this.plugin.settings.useTemplater = value;
						await this.plugin.saveSettings();
					});
			});

		if (hasTemplater) {
			new Setting(containerEl)
				.setName('Папка с шаблонами Templater')
				.setDesc('Укажи путь к папке, где хранятся шаблоны')
				.addText((text) => {
					text
						.setPlaceholder('5. Utils/Templates')
						.setValue(this.plugin.settings.templatesFolder)
						.onChange(async (value: string) => {
							this.plugin.settings.templatesFolder = value;
							await this.plugin.saveSettings();
						});

					// Добавляем автодополнение папок
					// Удаляем старый handler если есть
					if (this.focusHandler) {
						// @ts-ignore
						text.inputEl.removeEventListener('focus', this.focusHandler);
					}

					// Создаём и сохраняем новый handler
					this.focusHandler = () => {
						const folders = this.app.vault.getAllLoadedFiles()
							.filter((f): f is TFolder => f instanceof TFolder)
							.map(f => f.path)
							.sort();

						// Удаляем старый datalist если есть
						const oldDatalist = document.getElementById('folder-suggestions');
						if (oldDatalist) oldDatalist.remove();

						// Добавляем datalist для автодополнения
						// @ts-ignore
						const dataList = document.createElement('datalist');
						dataList.id = 'folder-suggestions';
						folders.forEach(folder => {
							const option = document.createElement('option');
							option.value = folder;
							dataList.appendChild(option);
						});
						// @ts-ignore
						text.inputEl.setAttribute('list', 'folder-suggestions');

						document.body.appendChild(dataList);
					};

					// @ts-ignore
					text.inputEl.addEventListener('focus', this.focusHandler);
				});

			new Setting(containerEl)
				.setName('Шаблон для дневных заметок')
				.setDesc('Имя файла шаблона (без расширения)')
				.addText((text) => {
					text
						.setPlaceholder('FOR Dayly Notes planing')
						.setValue(this.plugin.settings.dailyTemplate)
						.onChange(async (value: string) => {
							this.plugin.settings.dailyTemplate = value;
							await this.plugin.saveSettings();
						});
				});

			new Setting(containerEl)
				.setName('Шаблон для недельных заметок')
				.setDesc('Имя файла шаблона (без расширения)')
				.addText((text) => {
					text
						.setPlaceholder('Weekly template')
						.setValue(this.plugin.settings.weeklyTemplate)
						.onChange(async (value: string) => {
							this.plugin.settings.weeklyTemplate = value;
							await this.plugin.saveSettings();
						});
				});

			new Setting(containerEl)
				.setName('Шаблон для месячных заметок')
				.setDesc('Имя файла шаблона (без расширения)')
				.addText((text) => {
					text
						.setPlaceholder('Monthly template')
						.setValue(this.plugin.settings.monthlyTemplate)
						.onChange(async (value: string) => {
							this.plugin.settings.monthlyTemplate = value;
							await this.plugin.saveSettings();
						});
				});
		}

		// Разделитель
		containerEl.createEl('hr', { cls: 'habit-tracker-divider' });

		containerEl.createEl('h3', { text: '📂 Папки и форматы' });

		new Setting(containerEl)
			.setName('Папки с заметками')
			.setDesc('Список папок для сканирования (каждая с новой строки). Плагин рекурсивно сканирует эти папки.')
			.addTextArea((text) => {
				text
					.setPlaceholder('Daily Notes\n2. Areas/diary')
					.setValue(this.plugin.settings.watchedFolders)
					.onChange(async (value: string) => {
						this.plugin.settings.watchedFolders = value;
						await this.plugin.saveSettings();
						this.refreshView();
					});
				text.inputEl.rows = 4;
			});

		new Setting(containerEl)
			.setName('Форматы дат')
			.setDesc('Укажите форматы имен файлов (синтаксис Moment.js). Поддерживаются дневные, недельные, месячные и годовые заметки.')
			.addTextArea((text) => {
				text
					.setPlaceholder('DD.MM.YY\nYYYY-MM-DD')
					.setValue(this.plugin.settings.dateFormats)
					.onChange(async (value: string) => {
						this.plugin.settings.dateFormats = value;
						await this.plugin.saveSettings();
						this.refreshView();
					});
				text.inputEl.rows = 8;
			});

		// Справка по форматам
		const helpDiv = containerEl.createEl('div', { cls: 'habit-tracker-help' });

		helpDiv.createEl('h4', { text: '📖 Поддерживаемые форматы:' });
		helpDiv.createEl('p').createEl('strong', { text: 'Дневные заметки:' });
		helpDiv.createEl('ul', {}, ul => {
			ul.createEl('li', { text: 'DD.MM.YY — 30.12.24' });
			ul.createEl('li', { text: 'DD.MM.YYYY — 30.12.2024' });
			ul.createEl('li', { text: 'YYYY-MM-DD — 2024-12-30' });
		});

		helpDiv.createEl('p').createEl('strong', { text: 'Периодические заметки:' });
		helpDiv.createEl('ul', {}, ul => {
			ul.createEl('li', { text: 'gggg-[W]ww — 2024-W01 (Неделя, отображается в понедельник)' });
			ul.createEl('li', { text: 'YYYY-MM — 2024-12 (Месяц, отображается 1-го числа)' });
			ul.createEl('li', { text: 'YYYY-[Q]Q — 2024-Q1 (Квартал, отображается 1-го числа)' });
			ul.createEl('li', { text: 'YYYY — 2024 (Год, отображается 1 января)' });
		});
	}

	refreshView() {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_HABIT_TRACKER);
		leaves.forEach((leaf) => {
			if (leaf.view instanceof HabitTrackerView) {
				leaf.view.updateData();
			}
		});
	}
}
