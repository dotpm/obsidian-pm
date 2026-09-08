import { parse, stringify } from 'yaml'
import { setYamlCodec } from '@dotpm/core'
import { setPlatform } from '@dotpm/ui'
import { domPlatform } from '@dotpm/ui/dom-platform'
import '@dotpm/ui/dom-shim'

setYamlCodec({ parse, stringify })
if (typeof document !== 'undefined') setPlatform(domPlatform)
