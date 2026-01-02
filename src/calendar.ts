import { moment } from 'obsidian'; // Важно!

const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

export function getMonthName(date: moment.Moment): string {
	return MONTH_NAMES[date.month()];
}

export function generateCalendar(date: moment.Moment): (moment.Moment | null)[] {
	const start = date.clone().startOf('month');
	const end = date.clone().endOf('month');

	let firstDayIdx = start.day(); // 0-Sun
	firstDayIdx = firstDayIdx === 0 ? 6 : firstDayIdx - 1; // 0-Mon

	const days: (moment.Moment | null)[] = [];
	for(let i=0; i<firstDayIdx; i++) days.push(null);

	for(let i=1; i<=end.date(); i++) {
		days.push(date.clone().date(i));
	}
	return days;
}
