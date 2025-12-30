import { App, Plugin, PluginSettingTab, Setting, TFile, moment } from 'obsidian';
import { HabitTrackerView, VIEW_TYPE_HABIT_TRACKER } from './src/view';
import './styles.css';

interface HabitTrackerSettings {
	// Список папок для отслеживания (каждая с новой строки)
	watchedFolders: string;
	// Список форматов дат (каждый с новой строки)
	dateFormats: string;
}

const DEFAULT_SETTINGS: HabitTrackerSettings = {
	// Ваши папки по умолчанию
	watchedFolders: 'Daily Notes\n2. Areas/diary',

	// Форматы:
	// 1. DD.MM.YY (Ваш основной: 30.12.24)
	// 2. Стандартные (YYYY-MM-DD, DD.MM.YYYY)
	// 3. Периодические заметки (Недели, Месяцы, Кварталы, Годы)
	dateFormats: 'DD.MM.YY\nDD.MM.YYYY\nYYYY-MM-DD\ngggg-[W]ww\nYYYY-MM\nYYYY-[Q]Q\nYYYY',
}

export default class HabitTrackerPlugin extends Plugin {
	settings: HabitTrackerSettings;

	async onload() {
		console.log('Загрузка плагина Трекер Привычек');

		// Загрузка настроек
		await this.loadSettings();

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
		console.log('Выгрузка плагина Трекер Привычек');
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

	constructor(app: App, plugin: HabitTrackerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h3', { text: 'Источники данных' });

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
		const helpDiv = containerEl.createEl('div');
		helpDiv.style.marginTop = '20px';
		helpDiv.style.padding = '10px';
		helpDiv.style.background = 'var(--background-secondary)';
		helpDiv.style.borderRadius = '5px';
		helpDiv.style.fontSize = '0.9em';
		helpDiv.style.color = 'var(--text-muted)';

		helpDiv.createEl('h4', { text: '📖 Поддерживаемые форматы:' });
		const p1 = helpDiv.createEl('p');
		p1.innerHTML = '<strong>Дневные заметки:</strong>';
		helpDiv.createEl('ul', {}, ul => {
			ul.createEl('li', { text: 'DD.MM.YY — 30.12.24' });
			ul.createEl('li', { text: 'DD.MM.YYYY — 30.12.2024' });
			ul.createEl('li', { text: 'YYYY-MM-DD — 2024-12-30' });
		});

		const p2 = helpDiv.createEl('p');
		p2.innerHTML = '<strong>Периодические заметки:</strong>';
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
