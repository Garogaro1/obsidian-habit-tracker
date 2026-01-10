import { App, EventRef, ItemView, Setting, WorkspaceLeaf, TFile, moment } from 'obsidian';
import { generateCalendar, getMonthName } from './calendar';
import { calculateStatistics, HabitStats, getNotesOnThisDay, getRandomQualityNote } from './stats';

interface IHabitPlugin {
	getDailyNotes(): TFile[];
	settings: {
		watchedFolders: string;
		dateFormats: string;
		useTemplater: boolean;
		templatesFolder: string;
		dailyTemplate: string;
		weeklyTemplate: string;
		monthlyTemplate: string;
	};
	app: App;
	templater: unknown;
}

export const VIEW_TYPE_HABIT_TRACKER = 'habit-tracker-view';

type ViewMode = 'panorama' | 'year' | 'overview';

export class HabitTrackerView extends ItemView {
	plugin: IHabitPlugin;
	currentDate: moment.Moment;
	dailyNotes: TFile[] = [];
	stats: HabitStats;
	viewMode: ViewMode = 'panorama';
	private eventRef: EventRef;

	constructor(leaf: WorkspaceLeaf, plugin: IHabitPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.currentDate = moment(); // Используем импортированный moment
	}

	getViewType() { return VIEW_TYPE_HABIT_TRACKER; }
	getDisplayText() { return 'Трекер Привычек'; }

	async onOpen() {
		this.updateData();

		// Регистрируем обработчик событий vault для автообновления
		this.registerVaultEvent();

		await Promise.resolve();
	}

	registerVaultEvent() {
		// Отслеживаем создание и изменение файлов
		this.eventRef = this.plugin.app.vault.on('create', (file: TFile) => {
			if (file.extension === 'md') {
				// Проверяем, что файл в отслеживаемой папке
				const watchedFolders = this.plugin.settings.watchedFolders.split('\n').map(f => f.trim());
				const isInWatchedFolder = watchedFolders.some(folder => file.path.startsWith(folder));

				if (isInWatchedFolder) {
					this.updateData();
				}
			}
		});

		this.plugin.app.vault.on('modify', (file: TFile) => {
			if (file.extension === 'md') {
				const watchedFolders = this.plugin.settings.watchedFolders.split('\n').map(f => f.trim());
				const isInWatchedFolder = watchedFolders.some(folder => file.path.startsWith(folder));

				if (isInWatchedFolder) {
					this.updateData();
				}
			}
		});
	}

	async onClose() {
		// Удаляем обработчик событий при закрытии
		if (this.eventRef) {
			this.plugin.app.vault.offref(this.eventRef);
		}

		await Promise.resolve();
	}

	updateData() {
		this.dailyNotes = this.plugin.getDailyNotes();
		// Передаем форматы из настроек в статистику!
		this.stats = calculateStatistics(this.dailyNotes, this.plugin.settings.dateFormats);
		this.render();
	}

	// Хелпер: Получить данные о файле (дата и тип)
	getFileData(file: TFile): { date: moment.Moment, type: string } | null {
		const formats = this.plugin.settings.dateFormats.split('\n').map(f => f.trim()).filter(f => f.length > 0);
		const name = file.name.replace('.md', '');

		for (const format of formats) {
			const m = moment(name, format, true);
			if (m.isValid()) {
				let type = 'day';
				// Простая эвристика типов
				if (format.includes('W')) type = 'week';
				else if (format.includes('Q')) type = 'quarter';
				else if (format === 'YYYY') type = 'year';
				else if (format === 'YYYY-MM') type = 'month';

				// Нормализация даты для календаря
				if (type === 'week') m.startOf('isoWeek');
				if (type === 'month') m.startOf('month');
				if (type === 'quarter') m.startOf('quarter');
				if (type === 'year') m.startOf('year');

				return { date: m, type };
			}
		}
		return null;
	}

	render() {
		const container = this.containerEl;
		container.empty();
		container.addClass('habit-tracker-container');

		// Header
		const header = container.createEl('div', { cls: 'habit-tracker-header' });
		const row = header.createEl('div', { cls: 'header-row' });

		const titles = {
			'panorama': '🏛 Панорама (3 месяца)',
			'year': '🗺 Карта Года',
			'overview': '📆 Обзор'
		};
		row.createEl('h2', { text: titles[this.viewMode] });

		const switcher = row.createEl('div', { cls: 'mode-switcher' });
		switcher.createEl('button', { text: '3 мес', cls: `mode-btn ${this.viewMode === 'panorama' ? 'active' : ''}` })
			.onclick = () => { this.viewMode = 'panorama'; this.render(); };
		switcher.createEl('button', { text: 'Карта года', cls: `mode-btn ${this.viewMode === 'year' ? 'active' : ''}` })
			.onclick = () => { this.viewMode = 'year'; this.render(); };
		switcher.createEl('button', { text: 'Обзор', cls: `mode-btn ${this.viewMode === 'overview' ? 'active' : ''}` })
			.onclick = () => { this.viewMode = 'overview'; this.render(); };

		const mainContent = container.createEl('div', { cls: 'habit-tracker-main' });

		if (this.viewMode === 'panorama') this.renderPanorama(mainContent);
		else if (this.viewMode === 'year') this.renderYearHeatmap(mainContent);
		else if (this.viewMode === 'overview') this.renderMonthsOverview(mainContent);

		const sidebar = mainContent.createEl('div', { cls: 'tracker-sidebar' });

		// На Панораме только Ретро (занимает всё место)
		if (this.viewMode === 'panorama') {
			sidebar.addClass('sidebar-retro-only');
			this.renderRetroModule(sidebar);
		} else {
			// На Обзоре и Карте Года - только Статистика
			this.renderStatistics(sidebar);
		}
	}

	renderPanorama(container: HTMLElement) {
		const nav = container.createEl('div', { cls: 'panorama-nav' });
		nav.createEl('button', { text: '◀ Квартал', cls: 'mode-btn' }).onclick = () => { this.currentDate.subtract(3, 'months'); this.render(); };
		nav.createEl('span', { text: 'Сегодня', cls: 'mode-btn' }).onclick = () => { this.currentDate = moment(); this.render(); };
		nav.createEl('button', { text: 'Квартал ▶', cls: 'mode-btn' }).onclick = () => { this.currentDate.add(3, 'months'); this.render(); };

		// === КВАРТАЛЬНАЯ ЗАМЕТКА ===
		const currentYear = this.currentDate.year();
		const currentQuarter = this.currentDate.quarter();

		// Ищем квартальную заметку
		const quarterFile = this.dailyNotes.find(file => {
			const data = this.getFileData(file);
			return data && data.type === 'quarter' &&
				   data.date.year() === currentYear &&
				   data.date.quarter() === currentQuarter;
		});

		// Показываем квартальную заметку над календарями
		const quarterSection = container.createEl('div', { cls: 'panorama-quarter-note' });

		if (quarterFile) {
			const quarterCard = quarterSection.createEl('div', {
				cls: 'quarter-card-pano quarter-with-note-pano'
			});

			quarterCard.createEl('div', { cls: 'quarter-title-pano', text: `📊 ${currentYear} Q${currentQuarter}` });
			quarterCard.createEl('div', { cls: 'quarter-badge-pano', text: '✅ Есть заметка' });

			quarterCard.onmouseenter = () => {
				void (async () => {
					try {
						const content = await this.plugin.app.vault.read(quarterFile);
						const preview = content.slice(0, 150).replace(/[#*`]/g, '');
						quarterCard.setAttribute('data-preview', preview + (content.length > 150 ? '...' : ''));
					} catch (error) {
						console.error('Error reading file:', error);
					}
				})();
			};

			quarterCard.onclick = () => this.plugin.app.workspace.openLinkText(quarterFile.path, '', true);
		} else {
			const quarterCard = quarterSection.createEl('div', {
				cls: 'quarter-card-pano quarter-empty-pano'
			});

			quarterCard.createEl('div', { cls: 'quarter-title-pano', text: `📊 ${currentYear} Q${currentQuarter}` });
			quarterCard.createEl('div', { cls: 'quarter-badge-pano quarter-empty-badge-pano', text: '❌ Нет заметки' });

			quarterCard.onclick = () => {
				const folders = this.plugin.settings.watchedFolders.split('\n');
				const path = `${folders[0].trim()}/${currentYear}-Q${currentQuarter}.md`;
				this.createNoteIfNotExists(path);
			};
		}

		// Показываем текущий квартал (3 месяца)
		const quarterStart = this.currentDate.clone().startOf('quarter');
		const grid = container.createEl('div', { cls: 'calendars-grid' });

		for (let i = 0; i < 3; i++) {
			const monthDate = quarterStart.clone().add(i, 'months');
			this.renderSingleMonth(grid, monthDate);
		}
	}

	renderYearHeatmap(container: HTMLElement) {
		const wrapper = container.createEl('div', { cls: 'heatmap-container' });
		const grid = wrapper.createEl('div', { cls: 'heatmap-grid' });

		// Карта: YYYY-MM-DD -> {file, type}
		const notesMap = new Map<string, {file: TFile, type: string}>();
		this.dailyNotes.forEach(f => {
			const data = this.getFileData(f);
			if(data) notesMap.set(data.date.format('YYYY-MM-DD'), { file: f, type: data.type });
		});

		const start = moment().startOf('year'); // Всегда текущий год для хитмэпа
		const days = moment().endOf('year').dayOfYear();

		// GitHub style: 7 rows (days of week)
		// Для простоты рисуем по дням подряд, CSS Grid сам выстроит (grid-auto-flow: column)

		// Заполняем смещение до начала года
		// (Этот код упрощен, для настоящего GitHub style нужна сложная математика сетки,
		// но текущий CSS сделает простую змейку)

		for(let i=0; i<days; i++) {
			const d = start.clone().add(i, 'days');
			const dStr = d.format('YYYY-MM-DD');
			const note = notesMap.get(dStr);

			const cell = grid.createEl('div', {
				cls: `heatmap-day ${note ? 'active type-' + note.type : ''}`,
				attr: { 'aria-label': `${d.format('D MMM')} ${note ? '✅' : ''}` }
			});

			if (note) {
				// Preview при наведении
				cell.onmouseenter = () => {
					void (async () => {
						try {
							const content = await this.plugin.app.vault.read(note.file);
							const preview = content.slice(0, 150).replace(/[#*`]/g, '');
							cell.setAttribute('data-preview', preview + (content.length > 150 ? '...' : ''));
						} catch (error) {
							console.error('Error reading file:', error);
						}
					})();
				};

				cell.onclick = () => this.plugin.app.workspace.openLinkText(note.file.path, '', true);
			}
		}
	}

	renderSingleMonth(parent: HTMLElement, date: moment.Moment) {
		const box = parent.createEl('div', { cls: 'month-unit' });

		// Заголовок месяца с месячной заметкой
		const monthHeader = box.createEl('div', { cls: 'month-header-row' });
		new Setting(monthHeader).setHeading().setName(`${getMonthName(date)} ${date.year()}`).settingEl.addClass('month-label');

		// Ищем месячную заметку
		const monthFile = this.dailyNotes.find(file => {
			const data = this.getFileData(file);
			return data && data.type === 'month' &&
				   data.date.year() === date.year() &&
				   data.date.month() === date.month();
		});

		const monthIcon = monthHeader.createEl('div', { cls: 'month-note-icon' });

		if (monthFile) {
			monthIcon.addClass('month-note-exists');
			monthIcon.textContent = '📋';

			monthIcon.onmouseenter = () => {
				void (async () => {
					try {
						const content = await this.plugin.app.vault.read(monthFile);
						const preview = content.slice(0, 100).replace(/[#*`]/g, '');
						monthIcon.setAttribute('data-preview', preview + (content.length > 100 ? '...' : ''));
					} catch (error) {
						console.error('Error reading file:', error);
					}
				})();
			};

			monthIcon.onclick = () => this.plugin.app.workspace.openLinkText(monthFile.path, '', true);
		} else {
			monthIcon.addClass('month-note-empty');
			monthIcon.textContent = '+';

			monthIcon.onclick = () => {
				const folders = this.plugin.settings.watchedFolders.split('\n');
				const path = `${folders[0].trim()}/${date.format('YYYY-MM')}.md`;
				this.createNoteIfNotExists(path);
			};
		}

		const grid = box.createEl('div', { cls: 'calendar-grid mini-with-weeks' });

		// Заголовки: 7 дней + пустая колонка для недель
		['Пн','Вт','Ср','Чт','Пт','Сб','Вс',''].forEach(t => grid.createEl('div', { cls: 'calendar-day-header', text: t }));

		const days = generateCalendar(date);
		const notesMap = new Map<string, {file: TFile, type: string}>();
		this.dailyNotes.forEach(f => {
			const data = this.getFileData(f);
			// В календаре только дневные заметки
			if(data && data.type === 'day') {
				notesMap.set(data.date.format('YYYY-MM-DD'), { file: f, type: data.type });
			}
		});

		// Карта недельных заметок
		const weekNotesMap = new Map<string, TFile>();
		this.dailyNotes.forEach(f => {
			const data = this.getFileData(f);
			if(data && data.type === 'week') {
				const weekYear = data.date.year();
				const weekNum = data.date.isoWeek();
				const weekKey = `${weekYear}-W${weekNum.toString().padStart(2, '0')}`;
				weekNotesMap.set(weekKey, f);
			}
		});

		const today = moment().format('YYYY-MM-DD');

		// Группируем дни по неделям и добавляем недельные badges справа
		for (let i = 0; i < days.length; i += 7) {
			const weekDays = days.slice(i, i + 7);

			// Рисуем 7 дней недели
			weekDays.forEach(d => {
				const cell = grid.createEl('div', { cls: 'calendar-day' });
				if (d) {
					const dStr = d.format('YYYY-MM-DD');
					const note = notesMap.get(dStr);

					cell.createEl('div', { text: d.date().toString() });

					if (note) {
						cell.addClass('calendar-day-with-note');
						cell.addClass(`type-${note.type}`);

						cell.onmouseenter = () => {
							void (async () => {
								try {
									const content = await this.plugin.app.vault.read(note.file);
									const preview = content.slice(0, 150).replace(/[#*`]/g, '');
									cell.setAttribute('data-preview', preview + (content.length > 150 ? '...' : ''));
								} catch (error) {
									console.error('Error reading file:', error);
								}
							})();
						};

						cell.onclick = () => this.plugin.app.workspace.openLinkText(note.file.path, '', true);
					} else {
						cell.onclick = () => this.createNote(dStr);
					}

					if (dStr === today) cell.addClass('calendar-day-today');
					cell.ariaLabel = dStr;
				}
			});

			// Находим первый не-null день недели
			const firstDayOfWeek = weekDays.find(d => d !== null);
			if (firstDayOfWeek) {
				const weekDate = firstDayOfWeek.clone().startOf('isoWeek');
				const weekKey = `${weekDate.year()}-W${weekDate.isoWeek().toString().padStart(2, '0')}`;
				const weekFile = weekNotesMap.get(weekKey);
				const weekNum = weekDate.isoWeek();

				// Рисуем ячейку с недельным badge справа от недели
				const weekCell = grid.createEl('div', { cls: 'calendar-week-cell' });

				if (weekFile) {
					weekCell.addClass('week-cell-with-note');
					weekCell.createEl('div', { cls: 'week-number', text: `W${weekNum.toString().padStart(2, '0')}` });

					weekCell.onmouseenter = () => {
						void (async () => {
							try {
								const content = await this.plugin.app.vault.read(weekFile);
								const preview = content.slice(0, 80).replace(/[#*`]/g, '');
								weekCell.setAttribute('data-preview', preview + (content.length > 80 ? '...' : ''));
							} catch (error) {
								console.error('Error reading file:', error);
							}
						})();
					};

					weekCell.onclick = () => this.plugin.app.workspace.openLinkText(weekFile.path, '', true);
				} else {
					weekCell.addClass('week-cell-empty');
					weekCell.createEl('div', { cls: 'week-number', text: `W${weekNum.toString().padStart(2, '0')}` });

					weekCell.onclick = () => {
						const folders = this.plugin.settings.watchedFolders.split('\n');
						const path = `${folders[0].trim()}/${weekDate.format('gggg-[W]ww')}.md`;
						this.createNoteIfNotExists(path);
					};
				}
			} else {
				// Пустая ячейка если вся неделя null
				grid.createEl('div', { cls: 'calendar-week-cell empty' });
			}
		}
	}

	// === КВАРТАЛЫ (отдельный вид) ===
	renderQuarters(container: HTMLElement) {
		const wrapper = container.createEl('div', { cls: 'periodic-container' });

		// Навигация по годам
		const nav = wrapper.createEl('div', { cls: 'panorama-nav' });
		const currentYear = this.currentDate.year();
		new Setting(nav).setHeading().setName(`Кварталы ${currentYear}`).settingEl.addClass('heatmap-year-title');

		nav.createEl('button', { text: '◀ Пред. год', cls: 'mode-btn' }).onclick = () => {
			this.currentDate.subtract(1, 'year');
			this.render();
		};
		nav.createEl('button', { text: 'След. год ▶', cls: 'mode-btn' }).onclick = () => {
			this.currentDate.add(1, 'year');
			this.render();
		};

		const quartersGrid = wrapper.createEl('div', { cls: 'quarters-grid' });
		for (let q = 1; q <= 4; q++) {
			const quarterStart = moment().year(currentYear).quarter(q).startOf('quarter');

			// Ищем квартальную заметку
			const quarterFile = this.dailyNotes.find(file => {
				const data = this.getFileData(file);
				return data && data.type === 'quarter' &&
					   data.date.year() === currentYear &&
					   data.date.quarter() === q;
			});

			const quarterCard = quartersGrid.createEl('div', {
				cls: `quarter-card ${quarterFile ? 'quarter-with-note' : ''}`
			});

			const monthsInQuarter = [];
			for (let m = 0; m < 3; m++) {
				const mDate = quarterStart.clone().add(m, 'months');
				monthsInQuarter.push(getMonthName(mDate).slice(0, 3));
			}

			quarterCard.createEl('div', { cls: 'quarter-title', text: `Q${q}` });
			quarterCard.createEl('div', { cls: 'quarter-months', text: monthsInQuarter.join(' • ') });

			if (quarterFile) {
				quarterCard.createEl('div', { cls: 'quarter-badge', text: '✅ Есть заметка' });

				quarterCard.onmouseenter = () => {
					void (async () => {
						try {
							const content = await this.plugin.app.vault.read(quarterFile);
							const preview = content.slice(0, 150).replace(/[#*`]/g, '');
							quarterCard.setAttribute('data-preview', preview + (content.length > 150 ? '...' : ''));
						} catch (error) {
							console.error('Error reading file:', error);
						}
					})();
				};

				quarterCard.onclick = () => this.plugin.app.workspace.openLinkText(quarterFile.path, '', true);
			} else {
				quarterCard.createEl('div', { cls: 'quarter-badge quarter-empty', text: '❌ Нет заметки' });
				quarterCard.onclick = () => {
					const folders = this.plugin.settings.watchedFolders.split('\n');
					const path = `${folders[0].trim()}/${currentYear}-Q${q}.md`;
					this.createNoteIfNotExists(path);
				};
			}
		}
	}

	// === МЕСЯЦЫ (отдельный вид) ===
	renderPeriodicMonths(container: HTMLElement) {
		const wrapper = container.createEl('div', { cls: 'periodic-container' });

		// Навигация по годам
		const nav = wrapper.createEl('div', { cls: 'panorama-nav' });
		const currentYear = this.currentDate.year();
		new Setting(nav).setHeading().setName(`Месяцы ${currentYear}`).settingEl.addClass('heatmap-year-title');

		nav.createEl('button', { text: '◀ Пред. год', cls: 'mode-btn' }).onclick = () => {
			this.currentDate.subtract(1, 'year');
			this.render();
		};
		nav.createEl('button', { text: 'След. год ▶', cls: 'mode-btn' }).onclick = () => {
			this.currentDate.add(1, 'year');
			this.render();
		};

		const monthsGrid = wrapper.createEl('div', { cls: 'periodic-months-grid' });

		for (let m = 0; m < 12; m++) {
			const monthDate = moment().year(currentYear).month(m);
			const monthFile = this.dailyNotes.find(file => {
				const data = this.getFileData(file);
				return data && data.type === 'month' &&
					   data.date.year() === currentYear &&
					   data.date.month() === m;
			});

			const monthCard = monthsGrid.createEl('div', {
				cls: `periodic-month-card ${monthFile ? 'periodic-month-with-note' : ''}`
			});

			monthCard.createEl('div', { cls: 'periodic-month-name', text: getMonthName(monthDate).slice(0, 3) });

			if (monthFile) {
				monthCard.addClass('periodic-month-has-note');

				monthCard.onmouseenter = () => {
					void (async () => {
						try {
							const content = await this.plugin.app.vault.read(monthFile);
							const preview = content.slice(0, 150).replace(/[#*`]/g, '');
							monthCard.setAttribute('data-preview', preview + (content.length > 150 ? '...' : ''));
						} catch (error) {
							console.error('Error reading file:', error);
						}
					})();
				};

				monthCard.onclick = () => this.plugin.app.workspace.openLinkText(monthFile.path, '', true);
			} else {
				monthCard.onclick = () => {
					const folders = this.plugin.settings.watchedFolders.split('\n');
					const path = `${folders[0].trim()}/${monthDate.format('YYYY-MM')}.md`;
					this.createNoteIfNotExists(path);
				};
			}
		}
	}

	// === НЕДЕЛИ (отдельный вид) ===
	renderPeriodicWeeks(container: HTMLElement) {
		const wrapper = container.createEl('div', { cls: 'periodic-container' });

		// Навигация по годам
		const nav = wrapper.createEl('div', { cls: 'panorama-nav' });
		const currentYear = this.currentDate.year();
		new Setting(nav).setHeading().setName(`Недели ${currentYear}`).settingEl.addClass('heatmap-year-title');

		nav.createEl('button', { text: '◀ Пред. год', cls: 'mode-btn' }).onclick = () => {
			this.currentDate.subtract(1, 'year');
			this.render();
		};
		nav.createEl('button', { text: 'След. год ▶', cls: 'mode-btn' }).onclick = () => {
			this.currentDate.add(1, 'year');
			this.render();
		};

		const weeksByMonth = wrapper.createEl('div', { cls: 'weeks-by-month' });

		for (let m = 0; m < 12; m++) {
			const monthDate = moment().year(currentYear).month(m);
			const monthStart = monthDate.clone().startOf('month');
			const monthEnd = monthDate.clone().endOf('month');

			// Ищем все недельные заметки в этом месяце
			const weeksInMonth = [];
			let currentWeek = monthStart.clone().startOf('isoWeek');

			while (currentWeek.isBefore(monthEnd) || currentWeek.isSame(monthEnd, 'day')) {
				const weekFile = this.dailyNotes.find(file => {
					const data = this.getFileData(file);
					return data && data.type === 'week' &&
						   data.date.year() === currentYear &&
						   data.date.isoWeek() === currentWeek.isoWeek();
				});

				weeksInMonth.push({
					weekNum: currentWeek.isoWeek(),
					hasNote: !!weekFile,
					file: weekFile
				});

				currentWeek.add(1, 'week');
			}

			const monthBlock = weeksByMonth.createEl('div', { cls: 'month-weeks-block' });
			monthBlock.createEl('div', { cls: 'month-weeks-title', text: getMonthName(monthDate).slice(0, 3) });

			const weeksContainer = monthBlock.createEl('div', { cls: 'weeks-container' });

			weeksInMonth.forEach(({weekNum, hasNote, file}) => {
				const weekBadge = weeksContainer.createEl('div', {
					cls: `week-badge ${hasNote ? 'week-with-note' : 'week-empty'}`
				});

				weekBadge.textContent = `W${weekNum.toString().padStart(2, '0')}`;

				if (hasNote && file) {
					weekBadge.onmouseenter = () => {
						void (async () => {
							try {
								const content = await this.plugin.app.vault.read(file);
								const preview = content.slice(0, 100).replace(/[#*`]/g, '');
								weekBadge.setAttribute('data-preview', preview + (content.length > 100 ? '...' : ''));
							} catch (error) {
								console.error('Error reading file:', error);
							}
						})();
					};

					weekBadge.onclick = () => this.plugin.app.workspace.openLinkText(file.path, '', true);
				}
			});
		}
	}

	// === ГОДЫ (отдельный вид) ===
	renderPeriodicYears(container: HTMLElement) {
		const wrapper = container.createEl('div', { cls: 'periodic-container' });

		// Навигация
		const nav = wrapper.createEl('div', { cls: 'panorama-nav' });
		const currentYear = this.currentDate.year();
		new Setting(nav).setHeading().setName('Годы').settingEl.addClass('heatmap-year-title');

		nav.createEl('button', { text: '◀ На 5 лет назад', cls: 'mode-btn' }).onclick = () => {
			this.currentDate.subtract(5, 'year');
			this.render();
		};
		nav.createEl('button', { text: 'На 5 лет вперёд ▶', cls: 'mode-btn' }).onclick = () => {
			this.currentDate.add(5, 'year');
			this.render();
		};

		const yearsGrid = wrapper.createEl('div', { cls: 'years-grid' });

		// Показываем диапазон: текущий год ± 7 лет
		for (let y = currentYear - 7; y <= currentYear + 7; y++) {
			const yearFile = this.dailyNotes.find(file => {
				const data = this.getFileData(file);
				return data && data.type === 'year' && data.date.year() === y;
			});

			const yearCard = yearsGrid.createEl('div', {
				cls: `year-card ${yearFile ? 'year-with-note' : ''} ${y === currentYear ? 'current-year' : ''}`
			});

			yearCard.createEl('div', { cls: 'year-title', text: y.toString() });

			if (yearFile) {
				yearCard.createEl('div', { cls: 'year-badge', text: '✅ Есть' });

				yearCard.onmouseenter = () => {
					void (async () => {
						try {
							const content = await this.plugin.app.vault.read(yearFile);
							const preview = content.slice(0, 150).replace(/[#*`]/g, '');
							yearCard.setAttribute('data-preview', preview + (content.length > 150 ? '...' : ''));
						} catch (error) {
							console.error('Error reading file:', error);
						}
					})();
				};

				yearCard.onclick = () => this.plugin.app.workspace.openLinkText(yearFile.path, '', true);
			} else {
				yearCard.createEl('div', { cls: 'year-badge year-empty', text: '❌ Нет' });
				yearCard.onclick = () => {
					const folders = this.plugin.settings.watchedFolders.split('\n');
					const path = `${folders[0].trim()}/${y}.md`;
					this.createNoteIfNotExists(path);
				};
			}
		}
	}

	// === ОБЗОР ВСЕХ ТИПОВ ЗАМЕТОК ===
	renderMonthsOverview(container: HTMLElement) {
		const wrapper = container.createEl('div', { cls: 'overview-compact-container' });

		// Навигация по годам
		const nav = wrapper.createEl('div', { cls: 'panorama-nav' });
		new Setting(nav).setHeading().setName(`Обзор ${this.currentDate.year().toString()}`).settingEl.addClass('heatmap-year-title');

		nav.createEl('button', { text: '◀ Пред. год', cls: 'mode-btn' }).onclick = () => {
			this.currentDate.subtract(1, 'year');
			this.render();
		};
		nav.createEl('button', { text: 'След. год ▶', cls: 'mode-btn' }).onclick = () => {
			this.currentDate.add(1, 'year');
			this.render();
		};

		const currentYear = this.currentDate.year();

		// === КОМПАКТНАЯ ТАБЛИЦА: ГОД → КВАРТАЛЫ → МЕСЯЦЫ ===
		const table = wrapper.createEl('div', { cls: 'overview-table' });

		// Годовая заметка
		const yearFile = this.dailyNotes.find(file => {
			const data = this.getFileData(file);
			return data && data.type === 'year' && data.date.year() === currentYear;
		});

		const yearRow = table.createEl('div', { cls: 'overview-year-row' });
		const yearCell = yearRow.createEl('div', { cls: `overview-cell overview-year ${yearFile ? 'has-note' : ''}` });
		yearCell.createEl('strong', { text: String(currentYear) });
		if (yearFile) {
			yearCell.createEl('span', { cls: 'note-mark', text: '📋' });
			yearCell.onclick = () => this.plugin.app.workspace.openLinkText(yearFile.path, '', true);
		} else {
			yearCell.createEl('span', { cls: 'note-mark-empty', text: '+' });
			yearCell.onclick = () => {
				const folders = this.plugin.settings.watchedFolders.split('\n');
				this.createNoteIfNotExists(`${folders[0].trim()}/${currentYear}.md`);
			};
		}

		// Квартальные заметки (в одной строке)
		const quartersRow = yearRow.createEl('div', { cls: 'overview-quarters-row' });
		for (let q = 1; q <= 4; q++) {
			const quarterFile = this.dailyNotes.find(file => {
				const data = this.getFileData(file);
				return data && data.type === 'quarter' &&
					   data.date.year() === currentYear &&
					   data.date.quarter() === q;
			});

			const qCell = quartersRow.createEl('div', { cls: `overview-quarter ${quarterFile ? 'has-note' : ''}` });
			qCell.textContent = `Q${q}`;

			if (quarterFile) {
				qCell.onclick = () => this.plugin.app.workspace.openLinkText(quarterFile.path, '', true);
			} else {
				qCell.onclick = () => {
					const folders = this.plugin.settings.watchedFolders.split('\n');
					this.createNoteIfNotExists(`${folders[0].trim()}/${currentYear}-Q${q}.md`);
				};
			}
		}

		// Месячные заметки (4 строки по 3 месяца)
		const monthsGrid = table.createEl('div', { cls: 'overview-months-grid' });

		for (let m = 0; m < 12; m++) {
			const monthFile = this.dailyNotes.find(file => {
				const data = this.getFileData(file);
				return data && data.type === 'month' &&
					   data.date.year() === currentYear &&
					   data.date.month() === m;
			});

			// Подсчет дневных заметок за месяц
			let dayCount = 0;
			this.dailyNotes.forEach(file => {
				const data = this.getFileData(file);
				if (data && data.type === 'day' &&
					data.date.year() === currentYear &&
					data.date.month() === m) {
					dayCount++;
				}
			});

			const monthCell = monthsGrid.createEl('div', { cls: `overview-month ${monthFile ? 'has-note' : ''}` });

			const monthName = getMonthName(moment().year(currentYear).month(m)).slice(0, 3);
			monthCell.createEl('span', { cls: 'month-name', text: monthName });
			if (dayCount > 0) {
				monthCell.createEl('span', { cls: 'day-count', text: `${dayCount}д` });
			}
			if (monthFile) {
				monthCell.classList.add('month-with-monthly-note');
				monthCell.onclick = () => this.plugin.app.workspace.openLinkText(monthFile.path, '', true);
			} else {
				monthCell.onclick = () => {
					const folders = this.plugin.settings.watchedFolders.split('\n');
					this.createNoteIfNotExists(`${folders[0].trim()}/${moment().year(currentYear).month(m).format('YYYY-MM')}.md`);
				};
			}
		}

		// === СТАТИСТИКА ЗАПИСЕЙ ПО ТИПАМ ===
		const statsSection = wrapper.createEl('div', { cls: 'overview-stats-section' });

		// Подсчет по типам за текущий год
		const typeCounts = { day: 0, week: 0, month: 0, quarter: 0, year: 0 };
		this.dailyNotes.forEach(file => {
			const result = this.getFileData(file);
			if (result && result.date.year() === currentYear) {
				if (typeCounts[result.type as keyof typeof typeCounts] !== undefined) {
					typeCounts[result.type as keyof typeof typeCounts]++;
				}
			}
		});

		new Setting(statsSection).setHeading().setName(`📊 Заметки за ${currentYear} год`).settingEl.addClass('overview-stats-title');

		const statsBadges = statsSection.createEl('div', { cls: 'overview-stats-badges' });
		statsBadges.createEl('span', { cls: 'overview-stat-badge stat-day', text: `📅 Дни: ${typeCounts.day}` });
		statsBadges.createEl('span', { cls: 'overview-stat-badge stat-week', text: `📆 Недели: ${typeCounts.week}` });
		statsBadges.createEl('span', { cls: 'overview-stat-badge stat-month', text: `🗓️ Месяцы: ${typeCounts.month}` });
		statsBadges.createEl('span', { cls: 'overview-stat-badge stat-quarter', text: `📊 Кварталы: ${typeCounts.quarter}` });
		statsBadges.createEl('span', { cls: 'overview-stat-badge stat-year', text: `🎯 Годы: ${typeCounts.year}` });
	}

	async createNoteIfNotExists(path: string) {
		if (!this.plugin.app.vault.getAbstractFileByPath(path)) {
			const folder = path.split('/').slice(0, -1).join('/');
			if (!this.plugin.app.vault.getAbstractFileByPath(folder)) {
				await this.plugin.app.vault.createFolder(folder);
			}
			await this.plugin.app.vault.create(path, '');

			// Применяем Templater если включен
			if (this.plugin.settings.useTemplater && this.plugin.templater) {
				await this.applyTemplaterTemplate(path);
			}

			// Обновляем данные сразу после создания
			this.updateData();
		}
		await this.plugin.app.workspace.openLinkText(path, '', true);
	}

	async applyTemplaterTemplate(path: string) {
		// Определяем тип заметки по названию файла
		const fileName = path.split('/').pop()?.replace('.md', '') || '';

		let templateName = '';

		// Проверяем формат и выбираем шаблон
		if (fileName.match(/^\d{2}\.\d{2}\.\d{2}$/) || fileName.match(/^\d{4}-\d{2}-\d{2}$/)) {
			templateName = this.plugin.settings.dailyTemplate;
		} else if (fileName.match(/\d{4}-W\d{2}/)) {
			templateName = this.plugin.settings.weeklyTemplate;
		} else if (fileName.match(/^\d{4}-\d{2}$/)) {
			templateName = this.plugin.settings.monthlyTemplate;
		}

		if (!templateName) return;

		// Проверяем, что папка шаблонов указана
		if (!this.plugin.settings.templatesFolder) return;

		try {
			// Используем папку из настроек
			const templatePath = `${this.plugin.settings.templatesFolder}/${templateName}.md`;
			// @ts-ignore
			const templateFile = this.plugin.app.vault.getAbstractFileByPath(templatePath);

			if (!templateFile) return;

			// Получаем TFile для целевого файла
			// @ts-ignore
			const targetFile = this.plugin.app.vault.getAbstractFileByPath(path);

			if (!targetFile) return;

			// Применяем шаблон через API Templater (без задержки!)
			// @ts-ignore
			await this.plugin.templater.templater.write_template_to_file(templateFile, targetFile);
		} catch (error) {
			console.error('Templater error:', error);
		}
	}

	renderStatistics(container: HTMLElement) {
		const box = container.createEl('div', { cls: 'stats-container' });
		new Setting(box).setHeading().setName('📈 Прогресс');

		// Базовые метрики
		box.createEl('p', { cls: 'stat-item' }).createEl('strong', { text: `🔥 Текущая серия: ${this.stats.currentStreak} дн.` });
		box.createEl('p', { cls: 'stat-item' }).createEl('strong', { text: `📅 Последняя запись: ${this.stats.lastNoteDate}` });
		box.createEl('p', { cls: 'stat-item' }).createEl('strong', { text: `⏰ Прошло времени: ${this.stats.timeSinceLastNote}` });

		// Разделитель
		box.createEl('hr', { cls: 'stat-divider' });

		// Группировка заметок по годам и типам
		const yearTypeCounts = new Map<number, { day: number; week: number; month: number; quarter: number; year: number }>();

		this.dailyNotes.forEach(file => {
			const result = this.getFileData(file);
			if (result) {
				const noteYear = result.date.year();
				if (!yearTypeCounts.has(noteYear)) {
					yearTypeCounts.set(noteYear, { day: 0, week: 0, month: 0, quarter: 0, year: 0 });
				}
				const counts = yearTypeCounts.get(noteYear)!;
				if (counts[result.type as keyof typeof counts] !== undefined) {
					counts[result.type as keyof typeof counts]++;
				}
			}
		});

		// Показываем только последний год с заметками
		const sortedYears = Array.from(yearTypeCounts.keys()).sort((a, b) => b - a);
		const latestYear = sortedYears.length > 0 ? sortedYears[0] : moment().year();

		if (yearTypeCounts.has(latestYear)) {
			const counts = yearTypeCounts.get(latestYear)!;

			// Компактный горизонтальный блок для последнего года
			const yearRow = box.createEl('div', { cls: 'stat-year-compact' });
			yearRow.createEl('span', { cls: 'stat-year-label', text: `${latestYear}:` });

			if (counts.day > 0) yearRow.createEl('span', { cls: 'stat-badge stat-type-day', text: `📅 ${counts.day}` });
			if (counts.week > 0) yearRow.createEl('span', { cls: 'stat-badge stat-type-week', text: `📆 ${counts.week}` });
			if (counts.month > 0) yearRow.createEl('span', { cls: 'stat-badge stat-type-month', text: `🗓️ ${counts.month}` });
			if (counts.quarter > 0) yearRow.createEl('span', { cls: 'stat-badge stat-type-quarter', text: `📊 ${counts.quarter}` });
			if (counts.year > 0) yearRow.createEl('span', { cls: 'stat-badge stat-type-year', text: `🎯 ${counts.year}` });
		}

		// Всего заметок
		box.createEl('hr', { cls: 'stat-divider' });
		box.createEl('p', { cls: 'stat-item' }).createEl('strong', { text: `📝 Всего заметок: ${this.dailyNotes.length}` });

		// Сравнение заполнения предыдущего и текущего года
		const currentYear = moment().year();
		const lastYear = currentYear - 1;

		// Заполнение предыдущего года
		const lastYearStart = moment().year(lastYear).startOf('year');
		const lastYearEnd = moment().year(lastYear).endOf('year');
		const daysInLastYear = lastYearEnd.diff(lastYearStart, 'days') + 1;

		let lastYearDayNotes = 0;
		this.dailyNotes.forEach(file => {
			const result = this.getFileData(file);
			if (result && result.type === 'day' && result.date.year() === lastYear) {
				lastYearDayNotes++;
			}
		});

		const lastYearFillPercentage = daysInLastYear > 0 ? Math.round((lastYearDayNotes / daysInLastYear) * 100) : 0;

		// Заполнение текущего года
		const currentYearStart = moment().year(currentYear).startOf('year');
		const daysPassed = moment().diff(currentYearStart, 'days') + 1;

		let currentYearDayNotes = 0;
		this.dailyNotes.forEach(file => {
			const result = this.getFileData(file);
			if (result && result.type === 'day' && result.date.year() === currentYear) {
				currentYearDayNotes++;
			}
		});

		const currentYearFillPercentage = daysPassed > 0 ? Math.round((currentYearDayNotes / daysPassed) * 100) : 0;

		// Компактное сравнение
		const compareRow = box.createEl('div', { cls: 'stat-year-compare' });
		compareRow.createEl('strong', { text: '📈 Заполнение:' });
		compareRow.createEl('br');

		const span1 = compareRow.createEl('span', { cls: 'stat-compare-item' });
		span1.createEl('strong', { text: `${lastYear}: ` });
		span1.appendText(`${lastYearFillPercentage}% (${lastYearDayNotes}/${daysInLastYear})`);

		const span2 = compareRow.createEl('span', { cls: 'stat-compare-item' });
		span2.createEl('strong', { text: `${currentYear}: ` });
		span2.appendText(`${currentYearFillPercentage}% (${currentYearDayNotes}/${daysPassed})`);
	}

	renderRetroModule(container: HTMLElement) {
		const box = container.createEl('div', { cls: 'memory-box' });
		const head = box.createEl('div', { cls: 'retro-header' });
		new Setting(head).setHeading().setName('🕰 Ретро');

		const ctrls = box.createEl('div', { cls: 'retro-controls' });
		const btnDay = ctrls.createEl('button', { cls: 'retro-btn', text: '📅 Этот день' });
		const btnRnd = ctrls.createEl('button', { cls: 'retro-btn', text: '🎲 Рандом' });

		const preview = box.createEl('div', { cls: 'memory-preview' });

		btnDay.onclick = () => {
			void (async () => {
				const notes = getNotesOnThisDay(this.dailyNotes);
				if(notes.length) this.showPreview(notes[0], preview);
				else { preview.empty(); preview.createEl('span', { text: 'Пусто...' }); }
			})();
		};
		btnRnd.onclick = () => {
			void (async () => {
				const note = await getRandomQualityNote(this.plugin.app, this.dailyNotes);
				if(note) this.showPreview(note, preview);
			})();
		};

		btnDay.click(); // Автозагрузка
	}

	async showPreview(file: TFile, container: HTMLElement) {
		try {
			const content = await this.plugin.app.vault.read(file);
			container.empty();

			// Заголовок с датой
			new Setting(container).setHeading().setName(file.name.replace('.md', '')).settingEl.addClass('preview-date');

			// Полный контент заметки
			const contentEl = container.createEl('div', { cls: 'preview-content' });
			contentEl.textContent = content;

			// Кнопка открытия
			container.createEl('button', { cls: 'preview-open-button', text: '📂 Открыть в Obsidian' })
				.onclick = () => this.plugin.app.workspace.openLinkText(file.path, '', true);
		} catch (error) {
			console.error('Error reading file:', error);
		}
	}

	async createNote(dateStr: string) {
		const folders = this.plugin.settings.watchedFolders.split('\n');
		const formats = this.plugin.settings.dateFormats.split('\n');
		// Берем первую папку и первый формат
		const path = `${folders[0].trim()}/${moment(dateStr).format(formats[0].trim())}.md`;

		if(!this.plugin.app.vault.getAbstractFileByPath(path)) {
			// Проверка папки
			const folder = folders[0].trim();
			if(!this.plugin.app.vault.getAbstractFileByPath(folder)) await this.plugin.app.vault.createFolder(folder);
			await this.plugin.app.vault.create(path, '');

			// Применяем Templater если включен
			if (this.plugin.settings.useTemplater && this.plugin.templater) {
				await this.applyTemplaterTemplate(path);
			}

			// Обновляем данные сразу после создания
			this.updateData();
		}
		await this.plugin.app.workspace.openLinkText(path, '', true);
	}
}
