import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { allCountries } from '@/lib/countries';
import { cn } from '@/lib/utils';

interface CountryComboboxProps {
  /** Selected ISO 3166-1 alpha-2 code (uppercase), or '' when unset. */
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  /** Forwarded so the combobox sits in the form's tab order. */
  tabIndex?: number;
  id?: string;
  className?: string;
}

/**
 * Searchable ship-to country picker backed by ISO 3166-1 alpha-2 codes — the
 * same codes kind-30406 shipping options carry in their `country` tags, so
 * filtering needs no fuzzy text matching. Names are localised via
 * Intl.DisplayNames; search matches the name or the raw code.
 */
export function CountryCombobox({
  value,
  onChange,
  disabled,
  tabIndex,
  id,
  className,
}: CountryComboboxProps) {
  const [open, setOpen] = useState(false);
  const countries = useMemo(() => allCountries(), []);
  const selected = countries.find((c) => c.code === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          tabIndex={tabIndex}
          className={cn('w-full justify-between font-normal', className)}
        >
          {selected ? selected.name : 'Select country…'}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          filter={(itemValue, search) => {
            // itemValue is "CODE|Name"; match on either, case-insensitively.
            const q = search.toLowerCase();
            return itemValue.toLowerCase().includes(q) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Search country…" />
          <CommandList>
            <CommandEmpty>No country found.</CommandEmpty>
            <CommandGroup>
              {countries.map((country) => (
                <CommandItem
                  key={country.code}
                  value={`${country.code}|${country.name}`}
                  onSelect={() => {
                    onChange(country.code);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === country.code ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  {country.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
