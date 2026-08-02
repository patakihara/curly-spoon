/**
 * A single search field that goes deep — typed suggestions, not just a text input
 * (docs/DESIGN.md: "one field, typed results"). Wired as a proper ARIA combobox so
 * screen readers and keyboards get the same experience as a native search-and-select.
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
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const hasSuggestions = suggestions.length > 0;
  const showList = open && hasSuggestions;
  const activeId = showList && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined;

  const selectSuggestion = (suggestion: SearchSuggestion) => {
    onSuggestionSelect?.(suggestion);
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!hasSuggestions) return;
      setOpen(true);
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!hasSuggestions) return;
      setOpen(true);
      setActiveIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === 'Enter') {
      if (showList && activeIndex >= 0) {
        event.preventDefault();
        const suggestion = suggestions[activeIndex];
        if (suggestion) selectSuggestion(suggestion);
      } else {
        onSubmit?.(value);
        setOpen(false);
      }
    } else if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        setOpen(false);
        setActiveIndex(-1);
      }
    }
  };

  return (
    <div className={clsx('m3-search-field', className)}>
      <div className="m3-search-field__box">
        <Icon name="search" className="m3-search-field__leading-icon" />
        <input
          ref={mergeRefs(forwardedRef, inputRef)}
          className="m3-search-field__input"
          type="text"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={showList}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          placeholder={placeholder}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => hasSuggestions && setOpen(true)}
          onKeyDown={handleKeyDown}
        />
        {value ? (
          <button
            type="button"
            className="m3-search-field__clear"
            aria-label="Clear search"
            onClick={() => {
              onChange('');
              setOpen(false);
              inputRef.current?.focus();
            }}
          >
            <Icon name="close" />
          </button>
        ) : null}
      </div>
      <ul
        id={listboxId}
        role="listbox"
        className="m3-search-field__suggestions"
        hidden={!showList}
      >
        {suggestions.map((suggestion, index) => (
          <li
            key={suggestion.id}
            id={`${listboxId}-${index}`}
            role="option"
            aria-selected={index === activeIndex}
            className={clsx(
              'm3-search-field__suggestion',
              index === activeIndex && 'm3-search-field__suggestion--active',
            )}
            onMouseDown={(event) => {
              // mousedown (not click) so it fires before the input's blur.
              event.preventDefault();
              selectSuggestion(suggestion);
            }}
          >
            {suggestion.label}
          </li>
        ))}
      </ul>
    </div>
  );
});
