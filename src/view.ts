import { ItemView, WorkspaceLeaf, TFile, App } from 'obsidian';
import { generateCalendar, getMonthName } from './calendar';
import { calculateStatistics, HabitStats, getNotesOnThisDay, getRandomQualityNote } from './stats';

// Интерфейс плагина
interface IHabitPlugin {
	getDailyNotes(): TFile[];
	settings: { dailyNotesFolder: string };
	app: any;
}

export const VIEW_TYPE_HABIT_TRACKER = 'habit-tracker-view';

type ViewMode = 'panorama' | 'year';

export class HabitTrackerView extends ItemView {
	plugin: IHabitPlugin;
	currentDate: moment.Moment;
	dailyNotes: TFile[] = [];
	stats: HabitStats;
	viewMode: ViewMode = 'panorama'; // По умолчанию - панорама

	constructor(leaf: WorkspaceLeaf, plugin: IHabitPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.currentDate = window.moment();
	}

	getViewType() { return VIEW_TYPE_HABIT_TRACKER; }
	getDisplayText() { return 'Трекер Привычек'; }

	async onOpen() {
		this.updateData();
	}

	updateData() {
		this.dailyNotes = this.plugin.getDailyNotes();
		this.stats = calculateStatistics(this.dailyNotes);
		this.render();
	}

	render() {
		const container = this.containerEl.children[1] as HTMLElement;
		if (!container) return;

		container.empty();
		container.addClass('habit-tracker-container');

		// 1. Заголовок и Переключатель
		const header = container.createEl('div', { cls: 'habit-tracker-header' });
		const titleRow = header.createEl('div', { cls: 'header-row' });
		titleRow.createEl('h2', { text: this.viewMode === 'panorama' ? '🏛 Панорама Времени' : '🗺 Карта Года' });

		// Кнопки переключения
		const modeSwitcher = header.createEl('div', { cls: 'mode-switcher' });
		const btnPanorama = modeSwitcher.createEl('button', {
			cls: `mode-btn ${this.viewMode === 'panorama' ? 'active' : ''}`,
			text: '3 Месяца'
		});
		const btnYear = modeSwitcher.createEl('button', {
			cls: `mode-btn ${this.viewMode === 'year' ? 'active' : ''}`,
			text: 'Весь Год'
		});

		btnPanorama.onclick = () => { this.viewMode = 'panorama'; this.render(); };
		btnYear.onclick = () => { this.viewMode = 'year'; this.render(); };

		const mainContent = container.createEl('div', { cls: 'habit-tracker-main' });

		// 2. Основной контент (зависит от режима)
		if (this.viewMode === 'panorama') {
			this.renderPanorama(mainContent);
		} else {
			this.renderYearHeatmap(mainContent);
		}

		// 3. Сайдбар (общий для всех режимов)
		const sidebar = mainContent.createEl('div', { cls: 'tracker-sidebar' });
		this.renderStatistics(sidebar);
		this.renderRetroModule(sidebar);
	}

	// === РЕЖИМ ПАНОРАМЫ ===
	renderPanorama(container: HTMLElement) {
		// Навигация по месяцам
		const navRow = container.createEl('div', { cls: 'panorama-nav' });
		const btnPrev = navRow.createEl('button', {
			cls: 'panorama-nav-btn',
			text: '◀ Назад'
		});
		const btnNext = navRow.createEl('button', {
			cls: 'panorama-nav-btn',
			text: 'Вперёд ▶'
		});
		const btnToday = navRow.createEl('button', {
			cls: 'panorama-nav-btn panorama-today-btn',
			text: '📅 Сегодня'
		});

		btnPrev.onclick = () => {
			this.currentDate.subtract(3, 'months');
			this.render();
		};

		btnNext.onclick = () => {
			this.currentDate.add(3, 'months');
			this.render();
		};

		btnToday.onclick = () => {
			this.currentDate = window.moment();
			this.render();
		};

		const calendarsWrapper = container.createEl('div', { cls: 'calendars-grid' });
		for (let i = -1; i <= 1; i++) {
			const monthDate = this.currentDate.clone().add(i, 'months');
			this.renderSingleMonth(calendarsWrapper, monthDate);
		}
	}

	// === РЕЖИМ ГОДА (HEATMAP) ===
	renderYearHeatmap(container: HTMLElement) {
		// Навигация по годам
		const navRow = container.createEl('div', { cls: 'heatmap-nav' });
		const btnPrevYear = navRow.createEl('button', {
			cls: 'heatmap-nav-btn',
			text: '◀ Пред. год'
		});
		const yearTitle = navRow.createEl('h3', {
			cls: 'heatmap-year-title',
			text: this.currentDate.year().toString()
		});
		const btnNextYear = navRow.createEl('button', {
			cls: 'heatmap-nav-btn',
			text: 'След. год ▶'
		});

		btnPrevYear.onclick = () => {
			this.currentDate.subtract(1, 'year');
			this.render();
		};

		btnNextYear.onclick = () => {
			this.currentDate.add(1, 'year');
			this.render();
		};

		const heatmapContainer = container.createEl('div', { cls: 'heatmap-container' });

		// Создаем Set для быстрого поиска
		const notesMap = new Set(this.dailyNotes.map(f => {
			const m = f.name.match(/(\d{4}-\d{2}-\d{2})/);
			return m ? m[1] : '';
		}));

		// Генерируем даты с начала ТЕКУЩЕГО выбранного года
		const startOfYear = this.currentDate.clone().startOf('year');
		const endOfYear = this.currentDate.clone().endOf('year');
		const daysInYear = endOfYear.diff(startOfYear, 'days') + 1;

		// Сетка: 7 строк (дни недели), 53 столбца (недели)
		const grid = heatmapContainer.createEl('div', { cls: 'heatmap-grid' });

		// Добавляем пустые ячейки, если год начался не с понедельника
		let startDay = startOfYear.day(); // 0-Sun, 1-Mon
		startDay = startDay === 0 ? 6 : startDay - 1; // 0-Mon, 6-Sun

		for (let i = 0; i < startDay; i++) {
			grid.createEl('div', { cls: 'heatmap-day empty' });
		}

		for (let i = 0; i < daysInYear; i++) {
			const date = startOfYear.clone().add(i, 'days');
			const dateStr = date.format('YYYY-MM-DD');
			const hasNote = notesMap.has(dateStr);

			const dayEl = grid.createEl('div', {
				cls: `heatmap-day ${hasNote ? 'active' : ''}`,
				attr: { 'aria-label': `${date.format('D MMM YYYY')} ${hasNote ? '✅' : '❌'}` }
			});

			if (hasNote) {
				dayEl.onclick = () => this.openDailyNote(dateStr);
			}
		}
	}

	renderSingleMonth(parent: HTMLElement, date: moment.Moment) {
		const monthContainer = parent.createEl('div', { cls: 'month-unit' });
		// Название месяца
		monthContainer.createEl('h4', {
			text: `${getMonthName(date)} ${date.year()}`,
			cls: 'month-label'
		});

		const grid = monthContainer.createEl('div', { cls: 'calendar-grid mini' });

		// Дни недели
		const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
		weekdays.forEach(d => grid.createEl('div', { cls: 'calendar-day-header', text: d }));

		// Дни
		const calendarDays = generateCalendar(date);
		const notesMap = new Map<string, TFile>();
		this.dailyNotes.forEach((file) => {
			const match = file.name.match(/(\d{4}-\d{2}-\d{2})\.md/);
			if (match) notesMap.set(match[1], file);
		});
		const today = window.moment().format('YYYY-MM-DD');

		calendarDays.forEach((day) => {
			const dayEl = grid.createEl('div', { cls: 'calendar-day' });
			if (day) {
				const dateStr = day.format('YYYY-MM-DD');
				const note = notesMap.get(dateStr);

				dayEl.createEl('div', { cls: 'calendar-day-number', text: day.date().toString() });

				if (note) dayEl.addClass('calendar-day-with-note');
				if (dateStr === today) dayEl.addClass('calendar-day-today');

				dayEl.onclick = () => this.openDailyNote(dateStr);
				// Тултип с датой
				dayEl.ariaLabel = dateStr;
			}
		});
	}

	renderStatistics(container: HTMLElement) {
		const statsBox = container.createEl('div', { cls: 'stats-container' });
		statsBox.createEl('h3', { text: '📈 Прогресс' });
		statsBox.createEl('p', { cls: 'stat-item' }).innerHTML = `<strong>Серия:</strong> ${this.stats.currentStreak} дн. 🔥`;
		statsBox.createEl('p', { cls: 'stat-item' }).innerHTML = `<strong>Последняя:</strong> ${this.stats.lastNoteDate}`;
	}

	// === НОВЫЙ МОДУЛЬ РЕТРОСПЕКТИВЫ ===
	async renderRetroModule(container: HTMLElement) {
		const retroBox = container.createEl('div', { cls: 'memory-box' });

		// Заголовок и кнопки управления
		const header = retroBox.createEl('div', { cls: 'retro-header' });
		header.createEl('h3', { text: '🕰 Ретроспектива' });

		const controls = retroBox.createEl('div', { cls: 'retro-controls' });

		const btnToday = controls.createEl('button', { cls: 'retro-btn', text: '📅 В этот день' });
		const btnRandom = controls.createEl('button', { cls: 'retro-btn', text: '🎲 Случайно' });

		const previewContainer = retroBox.createEl('div', { cls: 'memory-preview' });
		previewContainer.createEl('p', { cls: 'preview-empty', text: 'Выберите режим просмотра' });

		// Логика кнопок
		btnToday.onclick = async () => {
			const notes = getNotesOnThisDay(this.dailyNotes);
			if (notes.length > 0) {
				// Берем самую старую заметку "в этот день" (чтобы видеть прогресс)
				const note = notes[0];
				await this.showPreviewInPanel(note, previewContainer, `Запись от ${note.name.replace('.md', '')}`);
			} else {
				previewContainer.empty();
				previewContainer.createEl('p', { text: 'Нет записей в этот день в прошлые годы.' });
			}
		};

		btnRandom.onclick = async () => {
			const note = await getRandomQualityNote(this.plugin.app, this.dailyNotes);
			if (note) {
				await this.showPreviewInPanel(note, previewContainer, `Случайная мысль (${note.name.replace('.md', '')})`);
			}
		};

		// Сразу пытаемся показать "В этот день" при загрузке
		btnToday.click();
	}

	async showPreviewInPanel(file: TFile, container: HTMLElement, title: string = '') {
		const content = await this.plugin.app.vault.read(file);
		container.empty();

		if (title) container.createEl('h4', { cls: 'preview-date', text: title });

		const maxLength = 300;
		const cleanText = content.replace(/^#+\s/gm, '').replace(/[*_]/g, '').slice(0, maxLength) + '...';

		container.createEl('p', { text: cleanText, cls: 'preview-text-p' });

		const btn = container.createEl('button', { cls: 'preview-open-button', text: 'Читать полностью' });
		btn.onclick = () => this.plugin.app.workspace.openLinkText(file.path, '', true);
	}

	async openDailyNote(dateStr: string) {
		const { dailyNotesFolder } = this.plugin.settings;
		const notePath = `${dailyNotesFolder}/${dateStr}.md`;
		const file = this.plugin.app.vault.getAbstractFileByPath(notePath);

		if (file instanceof TFile) {
			await this.plugin.app.workspace.openLinkText(notePath, '', true);
		} else {
			await this.plugin.app.vault.create(notePath, '');
			await this.plugin.app.workspace.openLinkText(notePath, '', true);
			this.updateData();
		}
	}
}
