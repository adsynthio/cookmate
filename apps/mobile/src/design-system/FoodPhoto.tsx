// U1: photos for ingredients and dishes with a food emoji stand-in, so every list looks complete while pictures are
// still being made (tools/media/sync.py connects them as they arrive).
import type { ImageSourcePropType, StyleProp, ViewStyle } from "react-native";

import { dishEmoji, foodTint, ingredientEmoji } from "@/domain/foodEmoji";

import { dishImage, ingredientImage } from "./media";
import { Photo } from "./primitives";

type Shape = { size?: number; round?: boolean; radius?: number; style?: StyleProp<ViewStyle> };

/** An ingredient: its photo, its category's photo, or a fitting emoji on its category's tint. */
export function FoodPhoto({ name, category, ...shape }: Shape & { name: string | null | undefined; category?: string | null }) {
  return <Photo source={ingredientImage(name, category)} emoji={ingredientEmoji(name, category)} tint={foodTint(category)} {...shape} />;
}

/** A dish: a given photo (an AI dish's picture), its generated photo, or a fitting emoji. */
export function DishPhoto({
  slug,
  name,
  course,
  source,
  ...shape
}: Shape & { slug: string | null | undefined; name?: string | null; course?: string | null; source?: ImageSourcePropType | null }) {
  const photo = source ?? (slug ? dishImage(slug) : null);
  return <Photo source={photo} emoji={dishEmoji(name || slug, course)} tint="peach" {...shape} />;
}
