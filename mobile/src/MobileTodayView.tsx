import type { WeatherData } from "../../shared/weather";
import type { CloudRecord, Mutation } from "../../shared/phone";
import type { AttendanceEntry } from "../../shared/studyAttendance";
import type { StudyBlock } from "../../shared/studyPrograms";
import { MobileDormMenuCard } from "./MobileDormMenuCard";
import { MobilePomodoroCard } from "./MobilePomodoroCard";
import { MobilePrayerCard } from "./MobilePrayerCard";
import { MobileTodayHero } from "./MobileShellParts";
import { MobileTasksCard } from "./MobileTasksCard";
import { MobileTimelineCard } from "./MobileTimelineCard";

type MobileTodayViewProps = {
  mobileGreeting: string;
  weather: WeatherData | null;
  today: string;
  tasks: CloudRecord[];
  unfinished: CloudRecord[];
  todayTasks: CloudRecord[];
  todayStudyBlocks: StudyBlock[];
  allWeekStudyBlocks: StudyBlock[];
  notesCount: number;
  attendance: Record<string, AttendanceEntry>;
  records: CloudRecord[];
  busy: boolean;
  isCollapsed: (id: string) => boolean;
  toggleCard: (id: string) => void;
  onOpenWeatherModal: () => void;
  onOpenPlanCalendar: () => void;
  onOpenNotes: () => void;
  onOpenTaskForm: (row?: CloudRecord) => void;
  onNewTask: (defaultToday?: boolean) => void;
  onToggleStudyBlock: (blockId: string) => void;
  onCompleteTask: (row: CloudRecord) => void;
  onSnoozeTask: (row: CloudRecord, minutes: number) => void;
  onSaveMutation: (mutation: Mutation) => Promise<void>;
  onDeleteTask: (row: CloudRecord) => void;
};

/** Today / Ana Ekran tab view combining Hero, Timeline, Tasks, Prayer, Dorm Menu, and Pomodoro. */
export function MobileTodayView({
  mobileGreeting,
  weather,
  today,
  tasks,
  unfinished,
  todayTasks,
  todayStudyBlocks,
  allWeekStudyBlocks,
  notesCount,
  attendance,
  records,
  busy,
  isCollapsed,
  toggleCard,
  onOpenWeatherModal,
  onOpenPlanCalendar,
  onOpenNotes,
  onOpenTaskForm,
  onNewTask,
  onToggleStudyBlock,
  onCompleteTask,
  onSnoozeTask,
  onSaveMutation,
  onDeleteTask,
}: MobileTodayViewProps) {
  return (
    <>
      <MobileTodayHero
        mobileGreeting={mobileGreeting}
        weather={weather}
        unfinishedCount={unfinished.length}
        todayStudyCount={todayStudyBlocks.length}
        notesCount={notesCount}
        onOpenWeatherModal={onOpenWeatherModal}
        onOpenPlanCalendar={onOpenPlanCalendar}
        onOpenNotes={onOpenNotes}
      />

      <MobileTimelineCard
        today={today}
        todayStudyBlocks={todayStudyBlocks}
        allWeekStudyBlocks={allWeekStudyBlocks}
        todayTasks={todayTasks}
        unfinished={unfinished}
        attendance={attendance}
        isCollapsed={isCollapsed("timeline")}
        onToggleCollapse={() => toggleCard("timeline")}
        onOpenFullPlan={onOpenPlanCalendar}
        onOpenTaskForm={row => onOpenTaskForm(row)}
      />

      <MobileTasksCard
        today={today}
        tasks={tasks}
        todayStudyBlocks={todayStudyBlocks}
        allWeekStudyBlocks={allWeekStudyBlocks}
        attendance={attendance}
        busy={busy}
        isCollapsed={isCollapsed("tasks")}
        onToggleCollapse={() => toggleCard("tasks")}
        onNewTask={onNewTask}
        onOpenTask={row => onOpenTaskForm(row)}
        onToggleStudyBlock={onToggleStudyBlock}
        onCompleteTask={onCompleteTask}
        onSnoozeTask={onSnoozeTask}
        onDeleteTask={onDeleteTask}
      />

      <MobilePrayerCard
        records={records}
        onSave={onSaveMutation}
        isCollapsed={isCollapsed("prayer")}
        onToggleCollapse={() => toggleCard("prayer")}
      />

      <MobileDormMenuCard
        isCollapsed={isCollapsed("dormMenu")}
        onToggleCollapse={() => toggleCard("dormMenu")}
      />

      <MobilePomodoroCard
        isCollapsed={isCollapsed("pomodoro")}
        onToggleCollapse={() => toggleCard("pomodoro")}
      />
    </>
  );
}
