import { Response as CentraResponse } from 'centra'
import { APIApplicationCommandOption, ApplicationCommandType, APIBaseInteraction } from 'discord-api-types'
import { Response } from 'express'

export type Command = {
  data: {
    name: string
    description: string
    options: APIApplicationCommandOption[]
    default_permission: boolean
    type: ApplicationCommandType
  }
  execute(interaction: APIBaseInteraction, res: Response): Promise<any>
  components: Component[]
  modals: Modal[]
}

export type Component = {
  name: string
  execute(interaction: APIBaseInteraction, res: Response): Promise<any>
}

export interface Res extends CentraResponse {
  body: any
}

export type Modal = {
  name: string
  execute(interaction: APIBaseInteraction, res: Response): Promise<any>
}