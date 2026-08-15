import type { Person } from '../../domain/entities';
import { AppError } from '../../domain/errors';
import type { PersonRepository } from '../../domain/ports';

export interface PersonUseCaseDeps {
  people: PersonRepository;
}

export interface CreatePersonInput {
  name: string;
}

export interface UpdatePersonInput {
  name: string;
  active?: number;
}

export function makePersonUseCases(deps: PersonUseCaseDeps) {
  const { people } = deps;

  return {
    list(): Person[] {
      return people.listAll();
    },
    create(input: CreatePersonInput): Person {
      return people.insert({ name: input.name });
    },
    update(id: number, input: UpdatePersonInput): Person {
      const active = (input.active ?? 1) ? 1 : 0;
      if (people.update(id, { name: input.name, active }) === 0) {
        throw new AppError(404, 'person not found');
      }
      return people.findById(id) as Person;
    },
  };
}
