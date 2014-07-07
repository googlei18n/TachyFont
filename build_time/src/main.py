"""
  Copyright 2014 Google Inc. All rights reserved.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
"""

from __future__ import print_function
import sys
import os
from fontTools.subset import Options
import cleanup
import closure
from preprocess import Preprocess


def main(args):
  """Main program to run preprocessing of the font Arguments:

    font-file
    --hinting=(False|True)  ,default is false
  """
  options = Options()
  args = options.parse_opts(args, ignore_unknown=True)
  if len(args) < 1:
    print('usage: ./pyprepfnt font-file [--option=value]...', file=sys.stderr)
    sys.exit(1)

  fontfile = args[0]
  args = args[1:]

  filename, extension = os.path.splitext(fontfile)

  cleanfile = filename + '_clean' + extension
  cleanup.cleanup(fontfile, False, cleanfile)

  closure.dump_closure_map(cleanfile, '.')

  preprocess = Preprocess(cleanfile, '.')
  preprocess.base_font()
  preprocess.cmap_dump()
  preprocess.serial_glyphs()


if __name__ == '__main__':
  main(sys.argv[1:])
