/**
 * Re-exports for ordering utilities.
 *
 * `lib/domain/curriculum.ts` owns the implementation; this module keeps the
 * `domain/order` import path that the plan's folder layout describes.
 */

export {
  findLesson,
  findModule,
  flattenCourse,
  hasContiguousOrder,
  lessonAt,
  moveItem,
  normalizeCourse,
  normalizeCourseModules,
  normalizeOrder,
  removeById,
  updateById,
} from "./curriculum";
