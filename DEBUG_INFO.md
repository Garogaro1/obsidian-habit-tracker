# 🔍 БАЗА ДЛЯ ОТЛАДКИ - Obsidian Habit Tracker Plugin

**Проблема:** Плагин установлен, но не отображается корректно.

**Задача:** Проанализируйте код, найдите ошибки и предложите исправления.

---

## 📂 СТРУКТУРА ПРОЕКТА

```
Plugin Obs/
├── main.ts           # Главный файл плагина
├── src/
│   ├── view.ts       # View компонент (календарь + превью)
│   ├── calendar.ts   # Логика календаря
│   └── stats.ts      # Расчёт статистики
├── styles.css        # Стили
├── manifest.json     # Метаданные
└── main.js          # Собранный плагин
```

---

## 📋 ИСХОДНЫЙ КОД

### 1. manifest.json
```json
{
	"id": "habit-tracker",
	"name": "Трекер Привычек",
	"version": "1.0.0",
	"minAppVersion": "0.15.0",
	"description": "Календарь и статистика для daily notes с трекингом привычек",
	"author": "Ivan Zhukov",
	"authorUrl": "https://github.com",
	"isDesktopOnly": false
}
```

### 2. main.ts
```typescript
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
```

### 3. src/view.ts
```typescript
import { ItemView, WorkspaceLeaf, TFile } from 'obsidian';
import HabitTrackerPlugin from '../main';
import { generateCalendar, getMonthName } from './calendar';
import { calculateStatistics, HabitStats } from './stats';

export const VIEW_TYPE_HABIT_TRACKER = 'habit-tracker-view';

export class HabitTrackerView extends ItemView {
	plugin: HabitTrackerPlugin;
	currentDate: moment.Moment;
	dailyNotes: TFile[];
	stats: HabitStats;

	constructor(leaf: WorkspaceLeaf, plugin: HabitTrackerPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.currentDate = window.moment();
		this.updateData();
	}

	getViewType() {
		return VIEW_TYPE_HABIT_TRACKER;
	}

	getDisplayText() {
		return 'Трекер Привычек';
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass('habit-tracker-container');

		this.render();
	}

	async onClose() {
		// Cleanup
	}

	updateData() {
		this.dailyNotes = this.plugin.getDailyNotes();
		this.stats = calculateStatistics(this.dailyNotes);
		this.render();
	}

	render() {
		const container = this.containerEl.children[1];
		container.empty();

		// Заголовок
		const header = container.createEl('div', { cls: 'habit-tracker-header' });
		header.createEl('h2', { text: '📊 Трекер Привычек' });

		// Контейнер для календаря и статистики
		const mainContent = container.createEl('div', { cls: 'habit-tracker-main' });

		// Календарь
		this.renderCalendar(mainContent);

		// Статистика
		this.renderStatistics(mainContent);
	}

	renderCalendar(container: HTMLElement) {
		const calendarContainer = container.createEl('div', { cls: 'calendar-container' });

		// Навигация по месяцам
		const nav = calendarContainer.createEl('div', { cls: 'calendar-nav' });

		const prevButton = nav.createEl('button', {
			cls: 'calendar-nav-button',
			text: '◀',
		});
		prevButton.onclick = () => {
			this.currentDate.subtract(1, 'month');
			this.render();
		};

		const monthTitle = nav.createEl('h3', { cls: 'calendar-month-title' });
		monthTitle.textContent = `${getMonthName(this.currentDate)} ${this.currentDate.year()}`;

		const nextButton = nav.createEl('button', {
			cls: 'calendar-nav-button',
			text: '▶',
		});
		nextButton.onclick = () => {
			this.currentDate.add(1, 'month');
			this.render();
		};

		// Создаём макет с календарём и превью
		const calendarLayout = calendarContainer.createEl('div', { cls: 'calendar-layout' });

		// Сетка календаря
		const calendarGrid = calendarLayout.createEl('div', { cls: 'calendar-grid-wrapper' });

		const grid = calendarGrid.createEl('div', { cls: 'calendar-grid' });

		// Заголовки дней недели
		const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
		weekdays.forEach((day) => {
			grid.createEl('div', {
				cls: 'calendar-day-header',
				text: day,
			});
		});

		// Дни месяца
		const calendarDays = generateCalendar(this.currentDate);

		// Создаём Map для быстрого поиска заметок по дате
		const notesMap = new Map<string, TFile>();
		this.dailyNotes.forEach((file) => {
			const match = file.name.match(/(\d{4}-\d{2}-\d{2})\.md/);
			if (match) {
				notesMap.set(match[1], file);
			}
		});

		const today = window.moment().format('YYYY-MM-DD');

		// Панель превью (изначально пустая)
		const previewPanel = calendarLayout.createEl('div', { cls: 'preview-panel' });
		previewPanel.createEl('h4', { cls: 'preview-title', text: '📝 Просмотр заметки' });
		const previewContent = previewPanel.createEl('div', { cls: 'preview-content' });
		previewContent.createEl('p', { cls: 'preview-empty', text: 'Наведи на день с заметкой 👆' });

		calendarDays.forEach((day) => {
			const dayEl = grid.createEl('div', { cls: 'calendar-day' });

			if (day) {
				const dateStr = day.format('YYYY-MM-DD');
				const note = notesMap.get(dateStr);
				const isToday = dateStr === today;

				// Добавляем дату в ячейку
				const dayNumber = dayEl.createEl('div', {
					cls: 'calendar-day-number',
					text: day.date().toString(),
				});

				if (note) {
					dayEl.addClass('calendar-day-with-note');

					// Hover для показа превью
					dayEl.onmouseenter = async () => {
						this.showPreviewInPanel(note, previewContent);
					};
				}

				if (isToday) {
					dayEl.addClass('calendar-day-today');
				}

				// Клик по дате
				dayEl.onclick = () => {
					this.openDailyNote(dateStr);
				};
			}
		});

		// Легенда
		const legend = calendarContainer.createEl('div', { cls: 'calendar-legend' });
		legend.createEl('span', {
			cls: 'legend-item',
			text: '🟢 С заметкой',
		});
		legend.createEl('span', {
			cls: 'legend-item',
			text: '🔵 Сегодня',
		});
	}

	async showPreviewInPanel(file: TFile, previewContent: HTMLElement) {
		// Читаем содержимое файла
		const content = await this.app.vault.read(file);

		// Очищаем панель
		previewContent.empty();

		// Дата
		const dateMatch = file.name.match(/(\d{4}-\d{2}-\d{2})/);
		if (dateMatch) {
			const date = window.moment(dateMatch[1]);
			previewContent.createEl('h5', {
				cls: 'preview-date',
				text: date.format('DD MMMM YYYY'),
			});
		}

		// Содержимое
		const previewText = previewContent.createEl('div', { cls: 'preview-text' });

		// Берём первые 500 символов
		const maxLength = 500;
		const truncatedContent = content.length > maxLength
			? content.substring(0, maxLength) + '...'
			: content;

		// Преобразуем markdown в простой текст
		const plainText = truncatedContent
			.replace(/^#+\s/gm, '') // Убираем заголовки
			.replace(/\*\*/g, '') // Убираем жирный
			.replace(/\*/g, '') // Убираем курсив
			.replace(/^-/gm, '•') // Заменяем - на •
			.trim();

		previewText.createEl('p', { text: plainText });

		// Кнопка "Открыть"
		const openButton = previewContent.createEl('button', {
			cls: 'preview-open-button',
			text: '📂 Открыть заметку',
		});
		openButton.onclick = async () => {
			await this.app.workspace.openLinkText(file.path, '', true);
		};
	}

	renderStatistics(container: HTMLElement) {
		const statsContainer = container.createEl('div', { cls: 'stats-container' });
		statsContainer.createEl('h3', { text: '📈 Статистика' });

		const lastNoteEl = statsContainer.createEl('p', { cls: 'stat-item' });
		lastNoteEl.innerHTML = `<strong>Последняя запись:</strong> ${this.stats.lastNoteDate || 'Нет записей'}`;

		const streakEl = statsContainer.createEl('p', { cls: 'stat-item' });
		const streakText = this.stats.currentStreak > 0 ? `${this.stats.currentStreak} дней 🔥` : '0 дней';
		streakEl.innerHTML = `<strong>Текущая серия:</strong> ${streakText}`;

		const timeSinceEl = statsContainer.createEl('p', { cls: 'stat-item' });
		timeSinceEl.innerHTML = `<strong>С последней записи:</strong> ${this.stats.timeSinceLastNote}`;
	}

	async openDailyNote(dateStr: string) {
		const { dailyNotesFolder } = this.plugin.settings;
		const notePath = `${dailyNotesFolder}/${dateStr}.md`;

		// Проверяем, существует ли заметка
		const file = this.app.vault.getAbstractFileByPath(notePath);

		if (file instanceof TFile) {
			// Открываем существующую заметку
			await this.app.workspace.openLinkText(notePath, '', true);
		} else {
			// Создаем новую заметку
			const newFile = await this.app.vault.create(notePath, '');
			await this.app.workspace.openLinkText(notePath, '', true);

			// Обновляем данные
			this.updateData();
		}
	}
}
```

### 4. src/calendar.ts
```typescript
// Названия месяцев на русском
const MONTH_NAMES = [
	'Январь',
	'Февраль',
	'Март',
	'Апрель',
	'Май',
	'Июнь',
	'Июль',
	'Август',
	'Сентябрь',
	'Октябрь',
	'Ноябрь',
	'Декабрь',
];

/**
 * Получить название месяца на русском
 */
export function getMonthName(date: moment.Moment): string {
	return MONTH_NAMES[date.month()];
}

/**
 * Сгенерировать сетку календаря для заданного месяца
 * Возвращает массив дней (null для пустых ячеек, moment.Moment для дней)
 */
export function generateCalendar(date: moment.Moment): (moment.Moment | null)[] {
	const year = date.year();
	const month = date.month();

	// Первый день месяца
	const firstDay = window.moment([year, month, 1]);

	// Последний день месяца
	const lastDay = window.moment([year, month + 1, 0]).subtract(1, 'day');

	// День недели первого дня месяца (0-6, где 0 = воскресенье)
	// В России неделя начинается с понедельника, поэтому конвертируем
	let firstDayOfWeek = firstDay.day();
	firstDayOfWeek = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

	// Количество дней в месяце
	const daysInMonth = lastDay.date();

	// Создаем массив для календаря (6 недель x 7 дней = 42 ячейки)
	const calendar: (moment.Moment | null)[] = [];

	// Пустые ячейки до первого дня месяца
	for (let i = 0; i < firstDayOfWeek; i++) {
		calendar.push(null);
	}

	// Дни месяца
	for (let day = 1; day <= daysInMonth; day++) {
		calendar.push(window.moment([year, month, day]));
	}

	return calendar;
}
```

### 5. src/stats.ts
```typescript
import { TFile } from 'obsidian';

export interface HabitStats {
	lastNoteDate: string;
	currentStreak: number;
	timeSinceLastNote: string;
}

/**
 * Рассчитать статистику на основе списка daily notes
 */
export function calculateStatistics(notes: TFile[]): HabitStats {
	if (notes.length === 0) {
		return {
			lastNoteDate: '',
			currentStreak: 0,
			timeSinceLastNote: 'Нет записей',
		};
	}

	// Извлечь даты из имен файлов
	const dates: moment.Moment[] = notes
		.map((file) => {
			const match = file.name.match(/(\d{4}-\d{2}-\d{2})\.md/);
			return match ? window.moment(match[1]) : null;
		})
		.filter((date): date is moment.Moment => date !== null)
		.sort((a, b) => (a.isBefore(b) ? 1 : -1)); // Сортировка по убыванию

	if (dates.length === 0) {
		return {
			lastNoteDate: '',
			currentStreak: 0,
			timeSinceLastNote: 'Нет записей',
		};
	}

	// Последняя заметка
	const lastNote = dates[0];
	const lastNoteDate = lastNote.format('DD MMM YYYY');

	// Текущая серия (streak)
	let currentStreak = 0;
	const today = window.moment().startOf('day');
	const yesterday = today.clone().subtract(1, 'day');

	// Если последняя заметка была сегодня или вчера, начинаем считать streak
	if (lastNote.isSame(today, 'day') || lastNote.isSame(yesterday, 'day')) {
		currentStreak = 1;

		// Идем назад по дням
		let checkDate = lastNote.clone().subtract(1, 'day');
		for (let i = 1; i < dates.length; i++) {
			if (dates[i].isSame(checkDate, 'day')) {
				currentStreak++;
				checkDate.subtract(1, 'day');
			} else {
				break;
			}
		}
	}

	// Время с последней заметки
	const now = window.moment();
	const diffDays = now.diff(lastNote, 'days');
	const diffHours = now.diff(lastNote, 'hours');
	const diffMinutes = now.diff(lastNote, 'minutes');

	let timeSinceLastNote: string;
	if (diffDays === 0) {
		if (diffHours === 0) {
			timeSinceLastNote = `${diffMinutes} минут назад`;
		} else {
			timeSinceLastNote = `${diffHours} час${getHoursSuffix(diffHours)} назад`;
		}
	} else if (diffDays === 1) {
		timeSinceLastNote = 'вчера';
	} else {
		timeSinceLastNote = `${diffDays} дн${getDaysSuffix(diffDays)} назад`;
	}

	return {
		lastNoteDate,
		currentStreak,
		timeSinceLastNote,
	};
}

/**
 * Получить правильное окончание для слова "день"
 */
function getDaysSuffix(days: number): string {
	const lastTwo = days % 100;
	const lastOne = days % 10;

	if (lastTwo >= 11 && lastTwo <= 19) {
		return 'ей';
	}

	switch (lastOne) {
		case 1:
			return 'ь';
		case 2:
		case 3:
		case 4:
			return 'я';
		default:
			return 'ей';
	}
}

/**
 * Получить правильное окончание для слова "час"
 */
function getHoursSuffix(hours: number): string {
	const lastTwo = hours % 100;
	const lastOne = hours % 10;

	if (lastTwo >= 11 && lastTwo <= 19) {
		return 'ов';
	}

	switch (lastOne) {
		case 1:
			return '';
		case 2:
		case 3:
		case 4:
			return 'а';
		default:
			return 'ов';
	}
}
```

### 6. styles.css
```css
/* Контейнер плагина */
.habit-tracker-container {
	padding: 20px;
	height: 100%;
	overflow-y: auto;
}

/* Заголовок */
.habit-tracker-header {
	text-align: center;
	margin-bottom: 20px;
}

.habit-tracker-header h2 {
	margin: 0;
	color: var(--text-accent);
	font-size: 24px;
}

/* Основной контент */
.habit-tracker-main {
	display: flex;
	flex-direction: column;
	gap: 30px;
}

/* Календарь */
.calendar-container {
	background: var(--background-secondary);
	padding: 20px;
	border-radius: 8px;
	border: 1px solid var(--background-modifier-border);
}

/* Навигация по календарю */
.calendar-nav {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 20px;
}

.calendar-month-title {
	margin: 0;
	font-size: 18px;
	color: var(--text-normal);
}

.calendar-nav-button {
	background: var(--interactive-normal);
	border: none;
	color: var(--text-normal);
	padding: 5px 10px;
	border-radius: 4px;
	cursor: pointer;
	font-size: 16px;
	transition: background 0.2s;
}

.calendar-nav-button:hover {
	background: var(--interactive-hover);
}

/* Layout с календарём и превью */
.calendar-layout {
	display: flex;
	gap: 20px;
	flex-wrap: wrap;
}

.calendar-grid-wrapper {
	flex: 1;
	min-width: 280px;
}

/* Сетка календаря */
.calendar-grid {
	display: grid;
	grid-template-columns: repeat(7, 1fr);
	gap: 5px;
	margin-bottom: 15px;
}

.calendar-day-header {
	text-align: center;
	font-weight: bold;
	color: var(--text-muted);
	font-size: 14px;
	padding: 5px;
}

.calendar-day {
	min-height: 50px;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 8px;
	border-radius: 4px;
	cursor: pointer;
	transition: all 0.2s;
	font-size: 14px;
	color: var(--text-normal);
	background: var(--background-primary);
	border: 1px solid var(--background-modifier-border);
	position: relative;
}

.calendar-day-number {
	font-weight: 500;
}

.calendar-day:hover {
	background: var(--background-modifier-hover);
	transform: scale(1.05);
}

.calendar-day-with-note {
	background: #4caf50;
	color: white;
	font-weight: bold;
}

.calendar-day-with-note:hover {
	background: #45a049;
}

.calendar-day-today {
	border: 2px solid #2196f3;
	box-shadow: 0 0 5px rgba(33, 150, 243, 0.5);
}

/* Панель превью */
.preview-panel {
	flex: 0 0 300px;
	background: var(--background-primary);
	padding: 15px;
	border-radius: 8px;
	border: 1px solid var(--background-modifier-border);
	max-height: 400px;
	overflow-y: auto;
}

.preview-title {
	margin: 0 0 15px 0;
	font-size: 16px;
	color: var(--text-normal);
	border-bottom: 1px solid var(--background-modifier-border);
	padding-bottom: 10px;
}

.preview-content {
	min-height: 200px;
}

.preview-empty {
	color: var(--text-muted);
	text-align: center;
	padding: 40px 20px;
	font-style: italic;
}

.preview-date {
	margin: 0 0 10px 0;
	font-size: 14px;
	color: var(--text-accent);
}

.preview-text {
	margin-bottom: 15px;
}

.preview-text p {
	margin: 0 0 10px 0;
	font-size: 13px;
	line-height: 1.6;
	color: var(--text-normal);
	white-space: pre-wrap;
}

.preview-open-button {
	width: 100%;
	background: var(--interactive-accent);
	color: var(--text-on-accent);
	border: none;
	padding: 8px 16px;
	border-radius: 4px;
	cursor: pointer;
	font-size: 14px;
	transition: background 0.2s;
}

.preview-open-button:hover {
	background: var(--interactive-accent-hover);
}

/* Легенда */
.calendar-legend {
	display: flex;
	gap: 15px;
	flex-wrap: wrap;
	justify-content: center;
	margin-top: 15px;
	padding-top: 15px;
	border-top: 1px solid var(--background-modifier-border);
}

.legend-item {
	font-size: 12px;
	color: var(--text-muted);
}

/* Статистика */
.stats-container {
	background: var(--background-secondary);
	padding: 20px;
	border-radius: 8px;
	border: 1px solid var(--background-modifier-border);
}

.stats-container h3 {
	margin: 0 0 15px 0;
	font-size: 18px;
	color: var(--text-normal);
}

.stat-item {
	margin: 10px 0;
	padding: 10px;
	background: var(--background-primary);
	border-radius: 4px;
	font-size: 14px;
	color: var(--text-normal);
}

.stat-item strong {
	color: var(--text-accent);
}

/* Адаптивность для мобильных */
@media (max-width: 768px) {
	.calendar-layout {
		flex-direction: column;
	}

	.preview-panel {
		flex: none;
		width: 100%;
		max-height: 300px;
	}

	.calendar-day {
		min-height: 40px;
		font-size: 12px;
		padding: 5px;
	}

	.habit-tracker-container {
		padding: 10px;
	}

	.calendar-container,
	.stats-container {
		padding: 15px;
	}

	.calendar-month-title {
		font-size: 16px;
	}
}
```

---

## 🐂 ВОЗМОЖНЫЕ ПРОБЛЕМЫ

### Проверьте эти моменты:

1. **Ошибка в импортах** - circular dependency между main.ts и view.ts
2. **containerEl.children[1]** - может быть undefined
3. **Moment.js не доступен** - window.moment может быть undefined
4. **Стили не применяются** - проблемы с CSS
5. **View не регистрируется** - проблема с registerView
6. **Async/await в constructor** - вызов updateData() в конструкторе

---

## 🔬 КАК ДИАГНОСТИРОВАТЬ

### 1. Проверить консоль разработчика
```
Ctrl+Shift+I → Console
```
Ищите ошибки типа:
- `TypeError: ...`
- `ReferenceError: ...`
- `Cannot read property ...`

### 2. Проверить, что плагин загрузился
```
Должна быть в консоли: "Загрузка плагина Трекер Привычек"
```

### 3. Проверить View
```javascript
// В консоли:
app.workspace.getLeavesOfType('habit-tracker-view')
```

---

## 📦 ЧТО НУЖНО СДЕЛАТЬ

1. **Найти ошибку в коде**
2. **Предложить исправление**
3. **Объяснить, почему возникает проблема**

---

## 🎯 ОЖИДАЕМЫЙ РЕЗУЛЬТАТ

Плагин должен:
- Открываться через Ctrl+P → "Открыть трекер привычек"
- Показывать календарь с днями месяца
- Зелёные дни = есть заметка
- Справа панель превью при наведении
- Статистика внизу

---

**Пожалуйста, проанализируйте код и найдите ошибки! 🙏**
