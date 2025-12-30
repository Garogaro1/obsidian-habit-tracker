import { App, Plugin, PluginSettingTab, Setting, Notice, TFile } from 'obsidian';
import { HabitTrackerView, VIEW_TYPE_HABIT_TRACKER } from './src/view';
import './styles.css';

interface HabitTrackerSettings {
	dailyNotesFolder: string;
}

const DEFAULT_SETTINGS: HabitTrackerSettings = {
	dailyNotesFolder: 'Daily Notes',
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

	// Получить все daily notes из настроенной папки
	getDailyNotes(): TFile[] {
		const folderPath = this.settings.dailyNotesFolder;
		const allFiles = this.app.vault.getMarkdownFiles();

		return allFiles.filter((file) => {
			// Проверяем, что файл находится в настроенной папке
			const isInFolder = file.path.startsWith(folderPath);

			// Проверяем, что имя файла соответствует формату YYYY-MM-DD.md
			const matchesDatePattern = /\d{4}-\d{2}-\d{2}\.md$/.test(file.name);

			return isInFolder && matchesDatePattern;
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

		new Setting(containerEl)
			.setName('Папка с Daily Notes')
			.setDesc('Укажите папку, где хранятся ваши ежедневные заметки')
			.addText((text) =>
				text
					.setPlaceholder('Daily Notes')
					.setValue(this.plugin.settings.dailyNotesFolder)
					.onChange(async (value) => {
						this.plugin.settings.dailyNotesFolder = value;
						await this.plugin.saveSettings();

						// Обновить view если он открыт
						const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_HABIT_TRACKER);
						leaves.forEach((leaf) => {
							if (leaf.view instanceof HabitTrackerView) {
								leaf.view.updateData();
							}
						});
					})
			);
	}
}
