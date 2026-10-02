/**
 * Curriculum structure helpers.
 *
 * Pure functions over `Module[]` / `Lesson[]`: flattening, contiguity
 * normalisation and the totals the catalog and detail pages display.
 */

import type { Course, FlatLesson, Lesson, Module } from "../types";

/**
 * Renumber `order` to `0, 1, 2…` while preserving the current sequence.
 *
 * Called after every reorder, insert and delete so `order` is always
 * contiguous (plan §2.1). A stable sort by the existing `order` decides the
 * sequence, so repeated normalisation is idempotent.
 */
export function normalizeOrder<T extends { order: number }>(items: readonly T[]): T[] {
  return [...items]
    .sort((a, b) => a.order - b.order)
    .map((item, index) => (item.order === index ? item : { ...item, order: index }));
}

/** Renumber modules and, recursively, their lessons. */
export function normalizeCourseModules(modules: readonly Module[]): Module[] {
  return normalizeOrder(modules).map((module) => ({
    ...module,
    lessons: normalizeOrder(module.lessons),
  }));
}

/** Apply {@link normalizeCourseModules} to a whole course. */
export function normalizeCourse(course: Course): Course {
  return { ...course, modules: normalizeCourseModules(course.modules) };
}

/**
 * Move an item within a list by one slot, returning a new normalised list.
 *
 * Out-of-range offsets are a no-op, which is what the visible Up/Down buttons
 * in the ModuleEditor rely on to disable themselves at the ends.
 */
export function moveItem<T extends { order: number }>(
  items: readonly T[],
  fromIndex: number,
  delta: -1 | 1,
): T[] {
  const ordered = [...items].sort((a, b) => a.order - b.order);
  const target = fromIndex + delta;

  if (fromIndex < 0 || fromIndex >= ordered.length) return ordered;
  if (target < 0 || target >= ordered.length) return ordered;

  const [moved] = ordered.splice(fromIndex, 1);
  ordered.splice(target, 0, moved);

  return normalizeOrder(ordered);
}

/** Drop an item by id and renumber what remains. */
export function removeById<T extends { id: string }>(items: readonly T[], id: string): T[] {
  return items.filter((item) => item.id !== id);
}

/** Replace an item by id, or return the list unchanged when absent. */
export function updateById<T extends { id: string }>(
  items: readonly T[],
  id: string,
  update: (item: T) => T,
): T[] {
  return items.map((item) => (item.id === id ? update(item) : item));
}

/**
 * Flatten a course into curriculum order.
 *
 * The canonical ordering used by resume, next-lesson and progress math.
 */
export function flattenCourse(course: Pick<Course, "modules">): FlatLesson[] {
  const modules = [...course.modules].sort((a, b) => a.order - b.order);
  const flat: FlatLesson[] = [];

  modules.forEach((module, moduleIndex) => {
    const lessons = [...module.lessons].sort((a, b) => a.order - b.order);

    lessons.forEach((lesson, lessonIndex) => {
      flat.push({ lesson, module, moduleIndex, lessonIndex, position: flat.length + 1 });
    });
  });

  return flat;
}

/** The lesson at a module-relative position, or `null` when out of range. */
export function lessonAt(course: Pick<Course, "modules">, lessonId: string): FlatLesson | null {
  return flattenCourse(course).find((entry) => entry.lesson.id === lessonId) ?? null;
}

/** `true` when `order` values run `0, 1, 2…` with no gaps or duplicates. */
export function hasContiguousOrder(items: ReadonlyArray<{ order: number }>): boolean {
  return items.every((item, index) => item.order === index);
}

/** Look up a module by id. */
export function findModule(course: Pick<Course, "modules">, moduleId: string): Module | null {
  return course.modules.find((module) => module.id === moduleId) ?? null;
}

/** Look up a lesson by id across all modules. */
export function findLesson(
  course: Pick<Course, "modules">,
  lessonId: string,
): { module: Module; lesson: Lesson } | null {
  for (const module of course.modules) {
    const lesson = module.lessons.find((entry) => entry.id === lessonId);
    if (lesson) return { module, lesson };
  }

  return null;
}
