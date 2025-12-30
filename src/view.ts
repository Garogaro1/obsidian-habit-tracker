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
