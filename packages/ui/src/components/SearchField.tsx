/**
 * A single search field that goes deep — typed suggestions, not just a text input
 * (docs/DESIGN.md: "one field, typed results"). Wired as a proper ARIA combobox so
 * screen readers and keyboards get the same experience as a native search-and-select.
 *
 * Mantine migration: `TextInput` supplies the field chrome (box, icon slots), and
 * `Combobox`/`Combobox.Dropdown`/`Combobox.Options`/`Combobox.Option` supply the
 * floating suggestion list. Deliberately *not* `Autocomplete` — `SearchSuggestion.label`
 * is a `ReactNode` and `onSuggestionSelect` hands back the whole suggestion object,
 * neither of which `Autocomplete`'s string/`ComboboxItem` data model can carry.
 *
 * `Combobox.Target` is used with `withAriaAttributes={false}` and
 * `withKeyboardNavigation={false}`: this component's ARIA wiring (`role="combobox"`,
 * `aria-autocomplete="list"`, `aria-controls`, `aria-activedescendant`) and keyboard
 * handling (arrow keys, Enter-selects-vs-Enter-submits, Escape) predate the migration
 * and are kept verbatim, rather than half-adopting Mantine's own combobox state
 * machine (which has no notion of "Enter submits when nothing is highlighted" — this
 * field's `onSubmit` contract) and ending up with two partially-overlapping sources of
 * truth for the same keystrokes.
 *
 * `withinPortal={false}` on `Combobox` is load-bearing, not cosmetic:
 * `e2e/ui/search-field.spec.ts` scopes its listbox/option assertions inside
 * `getByTestId('search-field')`; Mantine's default portal-to-`document.body` would
 * render the dropdown outside that wrapper and fail every one of those assertions
 * even though the UI looks identical on screen.
 */
import {
  forwardRef,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import clsx from 'clsx';
import { Combobox, TextInput, useCombobox } from '@mantine/core';
import { Icon } from './Icon.js';
import { mergeRefs } from '../internal/mergeRefs.js';
import './SearchField.css';

export interface SearchSuggestion {
  id: string;
  label: ReactNode;
}

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  suggestions?: SearchSuggestion[];
  onSuggestionSelect?: (suggestion: SearchSuggestion) => void;
  onSubmit?: (value: string) => void;
  'aria-label'?: string;
  className?: string;
}

export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  {
    value,
    onChange,
    placeholder = 'Search',
    suggestions = [],
    onSuggestionSelect,
    onSubmit,
    'aria-label': ariaLabel = 'Search',
    className,
  },
  forwardedRef,
) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listboxId = useId();
  const combobox = useCombobox();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const hasSuggestions = suggestions.length > 0;
  const showList = open && hasSuggestions;
  const activeId = showList && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined;

  const setOpenState = (next: boolean) => {
    setOpen(next);
    if (next) combobox.openDropdown();
    else combobox.closeDropdown();
  };

  const selectSuggestion = (suggestion: SearchSuggestion) => {
    onSuggestionSelect?.(suggestion);
    setOpenState(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!hasSuggestions) return;
      setOpenState(true);
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!hasSuggestions) return;
      setOpenState(true);
      setActiveIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === 'Enter') {
      if (showList && activeIndex >= 0) {
        event.preventDefault();
        const suggestion = suggestions[activeIndex];
        if (suggestion) selectSuggestion(suggestion);
      } else {
        onSubmit?.(value);
        setOpenState(false);
      }
    } else if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        setOpenState(false);
        setActiveIndex(-1);
      }
    }
  };

  return (
    <Combobox store={combobox} withinPortal={false} onOptionSubmit={() => undefined}>
      <Combobox.Target
        withAriaAttributes={false}
        withKeyboardNavigation={false}
        autoComplete="off"
      >
        <TextInput
          ref={mergeRefs(forwardedRef, inputRef)}
          className={clsx('m3-search-field', className)}
          radius="xl"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={showList}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          placeholder={placeholder}
          value={value}
          leftSection={<Icon name="search" className="m3-search-field__leading-icon" />}
          rightSection={
            value ? (
              <button
                type="button"
                className="m3-search-field__clear"
                aria-label="Clear search"
                onClick={() => {
                  onChange('');
                  setOpenState(false);
                  inputRef.current?.focus();
                }}
              >
                <Icon name="close" />
              </button>
            ) : undefined
          }
          onChange={(event) => {
            onChange(event.target.value);
            setOpenState(true);
            setActiveIndex(-1);
          }}
          onFocus={() => hasSuggestions && setOpenState(true)}
          onKeyDown={handleKeyDown}
        />
      </Combobox.Target>

      <Combobox.Dropdown hidden={!showList}>
        <Combobox.Options id={listboxId}>
          {suggestions.map((suggestion, index) => (
            <Combobox.Option
              key={suggestion.id}
              id={`${listboxId}-${index}`}
              value={suggestion.id}
              className={clsx(
                'm3-search-field__suggestion',
                index === activeIndex && 'm3-search-field__suggestion--active',
              )}
              aria-selected={index === activeIndex}
              onMouseDown={(event) => {
                // mousedown (not click) so it fires before the input's blur.
                event.preventDefault();
                selectSuggestion(suggestion);
              }}
            >
              {suggestion.label}
            </Combobox.Option>
          ))}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
});
