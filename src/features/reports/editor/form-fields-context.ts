/**
 * React context for passing form fields data to custom BlockNote blocks.
 * The editor wrapper sets this, and custom blocks consume it.
 */
import { createContext, useContext } from 'react'

import type { FormFieldOption } from './types'

interface FormFieldsContextValue {
  formFields: FormFieldOption[]
}

const FormFieldsContext = createContext<FormFieldsContextValue>({
  formFields: [],
})

export function useFormFields(): FormFieldsContextValue {
  return useContext(FormFieldsContext)
}

export { FormFieldsContext }
