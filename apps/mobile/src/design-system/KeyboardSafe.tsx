// Keeps a screen's bottom (the text box) above the keyboard. React Native's KeyboardAvoidingView measures from the
// top of the screen, so inside a sheet (Ask opens as one on iPhone) it under-pads and the box stays hidden. This
// measures where the view really ends on screen and pads by exactly the part the keyboard covers.
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { Keyboard, LayoutAnimation, Platform, View, type KeyboardEvent, type StyleProp, type ViewStyle } from "react-native";

export function KeyboardSafe({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const ref = useRef<ComponentRef<typeof View>>(null);
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const ease = (e: KeyboardEvent) => {
      if (Platform.OS === "ios") LayoutAnimation.configureNext({ duration: e.duration || 250, update: { type: "keyboard" } });
    };
    const show = (e: KeyboardEvent) => {
      ref.current?.measureInWindow((_x, y, _w, h) => {
        ease(e);
        setInset(Math.max(0, y + h - e.endCoordinates.screenY));
      });
    };
    const hide = (e: KeyboardEvent) => {
      ease(e);
      setInset(0);
    };
    const subs = Platform.OS === "ios"
      ? [Keyboard.addListener("keyboardWillShow", show), Keyboard.addListener("keyboardWillChangeFrame", show), Keyboard.addListener("keyboardWillHide", hide)]
      : [Keyboard.addListener("keyboardDidShow", show), Keyboard.addListener("keyboardDidHide", hide)];
    return () => subs.forEach((s) => s.remove());
  }, []);

  return (
    <View ref={ref} style={[{ flex: 1 }, style, { paddingBottom: inset }]}>
      {children}
    </View>
  );
}
